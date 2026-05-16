/**
 * Dataset Split Management Routes
 * 
 * Handles creating and managing dataset splits for inter-rater reliability studies
 */

import { randomBytes } from 'crypto';

/**
 * Register dataset split routes
 */
export function registerSplitRoutes(app, db, requireAuth, requireAdmin) {

// ============================================================================
// DATASET SPLIT MANAGEMENT
// ============================================================================

/**
 * GET /api/admin/splits/:datasetId
 * Get all splits for a dataset
 */
app.get('/api/admin/splits/:datasetId', requireAuth, requireAdmin, (req, res) => {
  try {
    const { datasetId } = req.params;
    
    const splits = db.prepare(`
      SELECT 
        ds.*,
        u.username as created_by_username,
        (SELECT COUNT(*) FROM split_allocations WHERE split_id = ds.id) as allocation_count
      FROM dataset_splits ds
      JOIN users u ON ds.created_by = u.id
      WHERE ds.dataset_id = ?
      ORDER BY ds.created_at DESC
    `).all(datasetId);
    
    // Get allocations for each split
    for (const split of splits) {
      split.allocations = db.prepare(`
        SELECT 
          sa.*,
          u.username,
          u.email
        FROM split_allocations sa
        JOIN users u ON sa.user_id = u.id
        WHERE sa.split_id = ?
        ORDER BY sa.percentage DESC
      `).all(split.id);
    }
    
    res.json(splits);
  } catch (error) {
    console.error('Get splits error:', error);
    res.status(500).json({ error: 'Failed to get splits' });
  }
});

/**
 * POST /api/admin/splits/:datasetId
 * Create a new dataset split
 * 
 * Body:
 * {
 *   name: string,
 *   description: string,
 *   overlap_percentage: number (0-100),
 *   allocations: [
 *     { user_id: string, percentage: number }
 *   ]
 * }
 */
app.post('/api/admin/splits/:datasetId', requireAuth, requireAdmin, (req, res) => {
  try {
    const { datasetId } = req.params;
    const { name, description, overlap_percentage, allocations } = req.body;
    
    // Validate input
    if (!name || overlap_percentage === undefined || !allocations || allocations.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (overlap_percentage < 0 || overlap_percentage > 100) {
      return res.status(400).json({ error: 'Overlap percentage must be between 0 and 100' });
    }
    
    // Validate allocations sum to 100 or less
    const totalPercentage = allocations.reduce((sum, a) => sum + a.percentage, 0);
    if (totalPercentage > 100 - overlap_percentage) {
      return res.status(400).json({ 
        error: `Individual allocations (${totalPercentage}%) exceed available percentage (${100 - overlap_percentage}%)` 
      });
    }
    
    // Begin transaction
    db.exec('BEGIN TRANSACTION');
    
    try {
      // Create split
      const splitResult = db.prepare(`
        INSERT INTO dataset_splits (dataset_id, name, description, overlap_percentage, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(datasetId, name, description || null, overlap_percentage, req.user.id);
      
      const splitId = splitResult.lastInsertRowid;
      
      console.log(`\nCreating dataset split "${name}" for dataset ${datasetId}`);
      
      // Get all samples for this dataset (without ORDER BY RANDOM for performance)
      console.log('  Loading samples...');
      const samples = db.prepare(`
        SELECT id FROM samples WHERE dataset_id = ?
      `).all(datasetId);
      console.log(`  Loaded ${samples.length} samples`);
      
      const totalSamples = samples.length;
      
      if (totalSamples === 0) {
        db.exec('ROLLBACK');
        return res.status(400).json({ error: 'Dataset has no samples' });
      }
      
      // Shuffle samples using Fisher-Yates algorithm (much faster than ORDER BY RANDOM)
      console.log('  Shuffling samples...');
      for (let i = samples.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [samples[i], samples[j]] = [samples[j], samples[i]];
      }
      console.log('  Samples shuffled');
      
      // Calculate sample counts
      const overlapCount = Math.floor(totalSamples * overlap_percentage / 100);
      const remainingCount = totalSamples - overlapCount;
      
      // Assign overlap samples to all users
      const overlapSamples = samples.slice(0, overlapCount);
      const remainingSamples = samples.slice(overlapCount);
      
      // Prepare batch insert statement
      const BATCH_SIZE = 1000;
      const insertAssignment = db.prepare(`
        INSERT INTO sample_assignments (dataset_id, sample_id, user_id, assignment_type)
        VALUES (?, ?, ?, ?)
      `);
      
      // Batch insert function for better performance (uses nested transactions)
      const batchInsert = (assignments) => {
        console.log(`  Inserting ${assignments.length} assignments in batches of ${BATCH_SIZE}...`);
        for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
          const batch = assignments.slice(i, i + BATCH_SIZE);
          // Note: We're already in a transaction, so this is just a savepoint
          for (const item of batch) {
            insertAssignment.run(item.dataset_id, item.sample_id, item.user_id, item.assignment_type);
          }
          if ((i + BATCH_SIZE) % 5000 === 0) {
            console.log(`    Progress: ${Math.min(i + BATCH_SIZE, assignments.length)}/${assignments.length}`);
          }
        }
        console.log(`  ✓ Inserted ${assignments.length} assignments`);
      };
      
      // Build all overlap assignments
      console.log(`  Building overlap assignments (${overlapCount} samples x ${allocations.length} users)...`);
      const overlapAssignments = [];
      for (const allocation of allocations) {
        for (const sample of overlapSamples) {
          overlapAssignments.push({
            dataset_id: datasetId,
            sample_id: sample.id,
            user_id: allocation.user_id,
            assignment_type: 'overlap'
          });
        }
      }
      
      // Insert overlap assignments in batches
      console.log(`  Inserting overlap assignments...`);
      batchInsert(overlapAssignments);
      
      // Build and insert individual assignments
      console.log(`  Building and inserting individual assignments...`);
      let currentIndex = 0;
      
      for (const allocation of allocations) {
        const allocationCount = Math.floor(remainingCount * allocation.percentage / 100);
        const userSamples = remainingSamples.slice(currentIndex, currentIndex + allocationCount);
        
        const individualAssignments = userSamples.map(sample => ({
          dataset_id: datasetId,
          sample_id: sample.id,
          user_id: allocation.user_id,
          assignment_type: 'individual'
        }));
        
        batchInsert(individualAssignments);
        
        // Save allocation with actual count
        db.prepare(`
          INSERT INTO split_allocations (split_id, user_id, percentage, sample_count)
          VALUES (?, ?, ?, ?)
        `).run(splitId, allocation.user_id, allocation.percentage, userSamples.length + overlapCount);
        
        currentIndex += allocationCount;
      }
      
      // Commit transaction
      console.log('  Committing transaction...');
      db.exec('COMMIT');
      console.log(`Split created successfully with ${totalSamples} samples\n`);
      
      // Return created split with allocations
      const split = db.prepare(`
        SELECT 
          ds.*,
          u.username as created_by_username
        FROM dataset_splits ds
        JOIN users u ON ds.created_by = u.id
        WHERE ds.id = ?
      `).get(splitId);
      
      split.allocations = db.prepare(`
        SELECT 
          sa.*,
          u.username,
          u.email
        FROM split_allocations sa
        JOIN users u ON sa.user_id = u.id
        WHERE sa.split_id = ?
      `).all(splitId);
      
      res.json(split);
      
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Create split error:', error);
    res.status(500).json({ error: 'Failed to create split' });
  }
});

/**
 * DELETE /api/admin/splits/:splitId
 * Delete a dataset split and all its assignments
 */
app.delete('/api/admin/splits/:splitId', requireAuth, requireAdmin, (req, res) => {
  try {
    const { splitId } = req.params;
    
    // Begin transaction
    db.exec('BEGIN TRANSACTION');
    
    try {
      // Get dataset_id before deleting
      const split = db.prepare('SELECT dataset_id FROM dataset_splits WHERE id = ?').get(splitId);
      
      if (!split) {
        db.exec('ROLLBACK');
        return res.status(404).json({ error: 'Split not found' });
      }
      
      // Delete all sample assignments for this split's dataset
      // (We'll need to identify which assignments belong to this split)
      // For now, we'll delete the split and allocations (assignments cascade from dataset)
      
      // Delete split (cascades to allocations)
      db.prepare('DELETE FROM dataset_splits WHERE id = ?').run(splitId);
      
      // Delete all sample assignments for this dataset
      // (In production, you might want to track split_id in sample_assignments)
      db.prepare('DELETE FROM sample_assignments WHERE dataset_id = ?').run(split.dataset_id);
      
      db.exec('COMMIT');
      
      res.json({ success: true, message: 'Split deleted successfully' });
      
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('Delete split error:', error);
    res.status(500).json({ error: 'Failed to delete split' });
  }
});

/**
 * GET /api/admin/splits/:splitId/assignments
 * Get sample assignments for a split
 */
app.get('/api/admin/splits/:splitId/assignments', requireAuth, requireAdmin, (req, res) => {
  try {
    const { splitId } = req.params;
    
    // Get split info
    const split = db.prepare('SELECT * FROM dataset_splits WHERE id = ?').get(splitId);
    
    if (!split) {
      return res.status(404).json({ error: 'Split not found' });
    }
    
    // Get assignments grouped by user
    const assignments = db.prepare(`
      SELECT 
        sa.user_id,
        u.username,
        u.email,
        sa.assignment_type,
        COUNT(*) as count
      FROM sample_assignments sa
      JOIN users u ON sa.user_id = u.id
      WHERE sa.dataset_id = ?
      GROUP BY sa.user_id, sa.assignment_type
      ORDER BY u.username, sa.assignment_type
    `).all(split.dataset_id);
    
    res.json(assignments);
    
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({ error: 'Failed to get assignments' });
  }
});

/**
 * GET /api/my-assignments/:datasetId
 * Get current user's assigned samples for a dataset
 */
app.get('/api/my-assignments/:datasetId', requireAuth, (req, res) => {
  try {
    const { datasetId } = req.params;
    
    const assignments = db.prepare(`
      SELECT 
        sa.sample_id,
        sa.assignment_type,
        s.filename,
        s.secure_token,
        s.vote_count,
        s.average_rating
      FROM sample_assignments sa
      JOIN samples s ON sa.sample_id = s.id
      WHERE sa.dataset_id = ? AND sa.user_id = ?
      ORDER BY s.id
    `).all(datasetId, req.user.id);
    
    res.json(assignments);
    
  } catch (error) {
    console.error('Get my assignments error:', error);
    res.status(500).json({ error: 'Failed to get assignments' });
  }
});

/**
 * GET /api/admin/splits/:splitId/comments
 * Get comments for samples in a dataset split
 */
app.get('/api/admin/splits/:splitId/comments', requireAuth, requireAdmin, (req, res) => {
  try {
    const { splitId } = req.params;
    
    // Get split info to find dataset_id
    const split = db.prepare('SELECT dataset_id FROM dataset_splits WHERE id = ?').get(splitId);
    
    if (!split) {
      return res.status(404).json({ error: 'Split not found' });
    }
    
    // Get all sample IDs assigned in this split (via sample_assignments for the dataset)
    // Since we don't track split_id in sample_assignments, we get all assignments for the dataset
    // and then get comments for those samples
    const comments = db.prepare(`
      SELECT 
        v.id,
        v.comment,
        v.created_at,
        v.user_id,
        v.sample_id,
        u.username,
        s.filename
      FROM votes v
      JOIN users u ON v.user_id = u.id
      JOIN samples s ON v.sample_id = s.id
      WHERE s.dataset_id = ? AND v.comment IS NOT NULL AND v.comment != ''
      ORDER BY v.created_at DESC
    `).all(split.dataset_id);
    
    res.json(comments);
    
  } catch (error) {
    console.error('Get split comments error:', error);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

}
