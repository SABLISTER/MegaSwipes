/**
 * Assignment Routes
 * 
 * Handles sample assignments to users for quality control workflows
 */

import db from '../database.js';

/**
 * Register assignment routes
 * @param {Express} app - Express application instance
 * @param {Function} requireAuth - Authentication middleware
 * @param {Function} requireAdmin - Admin authentication middleware
 */
export function registerAssignmentRoutes(app, requireAuth, requireAdmin) {
  /**
   * POST /api/admin/assignments
   * Create assignment(s) - single or batch
   * Body: { sample_id, user_id, assignment_type } or { sample_ids: [], user_ids: [], assignment_type }
   */
  app.post('/api/admin/assignments', requireAuth, requireAdmin, (req, res) => {
    try {
      const { sample_id, user_id, assignment_type, sample_ids, user_ids } = req.body;

      // Validate assignment type
      const validTypes = ['individual', 'overlap', 'excluded'];
      const assignmentType = assignment_type || 'individual';
      if (!validTypes.includes(assignmentType)) {
        return res.status(400).json({ error: 'Invalid assignment_type. Must be: individual, overlap, or excluded' });
      }

      // Handle single assignment
      if (sample_id && user_id) {
        // Verify sample exists
        const sample = db.prepare('SELECT id, dataset_id FROM samples WHERE id = ?').get(sample_id);
        if (!sample) {
          return res.status(404).json({ error: 'Sample not found' });
        }

        // Verify user exists
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Check if assignment already exists
        const existing = db.prepare(`
          SELECT id FROM sample_assignments
          WHERE sample_id = ? AND user_id = ?
        `).get(sample_id, user_id);

        if (existing) {
          return res.status(400).json({ error: 'Assignment already exists' });
        }

        // Create assignment
        const insertAssignment = db.prepare(`
          INSERT INTO sample_assignments (dataset_id, sample_id, user_id, assignment_type)
          VALUES (?, ?, ?, ?)
        `);

        const result = insertAssignment.run(sample.dataset_id, sample_id, user_id, assignmentType);

        res.json({
          success: true,
          message: 'Assignment created successfully',
          assignment: {
            id: result.lastInsertRowid,
            sample_id: sample_id,
            user_id: user_id,
            assignment_type: assignmentType
          }
        });
        return;
      }

      // Handle batch assignment
      if (sample_ids && user_ids && Array.isArray(sample_ids) && Array.isArray(user_ids)) {
        if (sample_ids.length === 0 || user_ids.length === 0) {
          return res.status(400).json({ error: 'sample_ids and user_ids arrays must not be empty' });
        }

        // Verify all samples exist and get their dataset_ids
        const samples = db.prepare(`
          SELECT id, dataset_id FROM samples WHERE id IN (${sample_ids.map(() => '?').join(',')})
        `).all(...sample_ids);

        if (samples.length !== sample_ids.length) {
          return res.status(400).json({ error: 'One or more samples not found' });
        }

        // Verify all users exist
        const users = db.prepare(`
          SELECT id FROM users WHERE id IN (${user_ids.map(() => '?').join(',')})
        `).all(...user_ids);

        if (users.length !== user_ids.length) {
          return res.status(400).json({ error: 'One or more users not found' });
        }

        // Create assignments (cartesian product: all samples to all users)
        const insertAssignment = db.prepare(`
          INSERT OR IGNORE INTO sample_assignments (dataset_id, sample_id, user_id, assignment_type)
          VALUES (?, ?, ?, ?)
        `);

        const results = {
          created: 0,
          skipped: 0
        };

        const batchInsert = db.transaction(() => {
          for (const sample of samples) {
            for (const user of users) {
              const result = insertAssignment.run(sample.dataset_id, sample.id, user.id, assignmentType);
              if (result.changes > 0) {
                results.created++;
              } else {
                results.skipped++;
              }
            }
          }
        });

        batchInsert();

        res.json({
          success: true,
          message: `Created ${results.created} assignments, skipped ${results.skipped} duplicates`,
          results: results
        });
        return;
      }

      res.status(400).json({ error: 'Invalid request. Provide either (sample_id, user_id) or (sample_ids[], user_ids[])' });
    } catch (error) {
      console.error('Create assignment error:', error);
      res.status(500).json({ error: 'Failed to create assignment: ' + error.message });
    }
  });

  /**
   * GET /api/admin/assignments
   * List all assignments with optional filters
   * Query params: dataset_id, user_id, sample_id, assignment_type
   */
  app.get('/api/admin/assignments', requireAuth, requireAdmin, (req, res) => {
    try {
      const { dataset_id, user_id, sample_id, assignment_type } = req.query;

      let query = `
        SELECT 
          sa.id,
          sa.dataset_id,
          sa.sample_id,
          sa.user_id,
          sa.assignment_type,
          sa.created_at,
          s.filename,
          s.file_path,
          u.username,
          u.email,
          d.name as dataset_name
        FROM sample_assignments sa
        JOIN samples s ON sa.sample_id = s.id
        JOIN users u ON sa.user_id = u.id
        JOIN datasets d ON sa.dataset_id = d.id
        WHERE 1=1
      `;

      const params = [];

      if (dataset_id) {
        query += ' AND sa.dataset_id = ?';
        params.push(dataset_id);
      }

      if (user_id) {
        query += ' AND sa.user_id = ?';
        params.push(user_id);
      }

      if (sample_id) {
        query += ' AND sa.sample_id = ?';
        params.push(sample_id);
      }

      if (assignment_type) {
        query += ' AND sa.assignment_type = ?';
        params.push(assignment_type);
      }

      query += ' ORDER BY sa.created_at DESC';

      const assignments = db.prepare(query).all(...params);

      res.json(assignments);
    } catch (error) {
      console.error('Get assignments error:', error);
      res.status(500).json({ error: 'Failed to get assignments' });
    }
  });

  /**
   * DELETE /api/admin/assignments/:id
   * Delete an assignment
   */
  app.delete('/api/admin/assignments/:id', requireAuth, requireAdmin, (req, res) => {
    try {
      const result = db.prepare('DELETE FROM sample_assignments WHERE id = ?').run(req.params.id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Assignment not found' });
      }

      res.json({ success: true, message: 'Assignment deleted successfully' });
    } catch (error) {
      console.error('Delete assignment error:', error);
      res.status(500).json({ error: 'Failed to delete assignment' });
    }
  });

  /**
   * POST /api/admin/assignments/bulk
   * Bulk assign samples to users
   * Body: { sample_ids: [], user_ids: [], assignment_type }
   */
  app.post('/api/admin/assignments/bulk', requireAuth, requireAdmin, (req, res) => {
    try {
      const { sample_ids, user_ids, assignment_type } = req.body;

      if (!sample_ids || !Array.isArray(sample_ids) || sample_ids.length === 0) {
        return res.status(400).json({ error: 'sample_ids array is required and must not be empty' });
      }

      if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
        return res.status(400).json({ error: 'user_ids array is required and must not be empty' });
      }

      const validTypes = ['individual', 'overlap', 'excluded'];
      const assignmentType = assignment_type || 'individual';
      if (!validTypes.includes(assignmentType)) {
        return res.status(400).json({ error: 'Invalid assignment_type. Must be: individual, overlap, or excluded' });
      }

      // Verify all samples exist and get their dataset_ids
      const samples = db.prepare(`
        SELECT id, dataset_id FROM samples WHERE id IN (${sample_ids.map(() => '?').join(',')})
      `).all(...sample_ids);

      if (samples.length !== sample_ids.length) {
        return res.status(400).json({ error: 'One or more samples not found' });
      }

      // Verify all users exist
      const users = db.prepare(`
        SELECT id FROM users WHERE id IN (${user_ids.map(() => '?').join(',')})
      `).all(...user_ids);

      if (users.length !== user_ids.length) {
        return res.status(400).json({ error: 'One or more users not found' });
      }

      // Create assignments (cartesian product: all samples to all users)
      const insertAssignment = db.prepare(`
        INSERT OR IGNORE INTO sample_assignments (dataset_id, sample_id, user_id, assignment_type)
        VALUES (?, ?, ?, ?)
      `);

      const results = {
        created: 0,
        skipped: 0
      };

      const batchInsert = db.transaction(() => {
        for (const sample of samples) {
          for (const user of users) {
            const result = insertAssignment.run(sample.dataset_id, sample.id, user.id, assignmentType);
            if (result.changes > 0) {
              results.created++;
            } else {
              results.skipped++;
            }
          }
        }
      });

      batchInsert();

      res.json({
        success: true,
        message: `Created ${results.created} assignments, skipped ${results.skipped} duplicates`,
        results: results
      });
    } catch (error) {
      console.error('Bulk assignment error:', error);
      res.status(500).json({ error: 'Failed to create bulk assignments: ' + error.message });
    }
  });

  /**
   * GET /api/admin/assignments/stats
   * Get assignment statistics
   */
  app.get('/api/admin/assignments/stats', requireAuth, requireAdmin, (req, res) => {
    try {
      // Overall stats
      const overall = db.prepare(`
        SELECT 
          COUNT(*) as total_assignments,
          COUNT(DISTINCT sample_id) as unique_samples,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT dataset_id) as unique_datasets
        FROM sample_assignments
      `).get();

      // Per user stats
      const perUser = db.prepare(`
        SELECT 
          u.id,
          u.username,
          u.email,
          COUNT(sa.id) as assignment_count,
          COUNT(DISTINCT sa.sample_id) as unique_samples,
          COUNT(DISTINCT sa.dataset_id) as unique_datasets
        FROM users u
        LEFT JOIN sample_assignments sa ON u.id = sa.user_id
        GROUP BY u.id, u.username, u.email
        HAVING COUNT(sa.id) > 0
        ORDER BY assignment_count DESC
      `).all();

      // Per dataset stats
      const perDataset = db.prepare(`
        SELECT 
          d.id,
          d.name as dataset_name,
          COUNT(DISTINCT s.id) as total_samples,
          COUNT(DISTINCT sa.sample_id) as assigned_samples,
          COUNT(sa.id) as total_assignments,
          COUNT(DISTINCT sa.user_id) as assigned_users
        FROM datasets d
        LEFT JOIN samples s ON d.id = s.dataset_id
        LEFT JOIN sample_assignments sa ON s.id = sa.sample_id
        GROUP BY d.id, d.name
        ORDER BY d.name
      `).all();

      // Unassigned samples count
      const unassigned = db.prepare(`
        SELECT COUNT(*) as count
        FROM samples s
        WHERE NOT EXISTS (
          SELECT 1 FROM sample_assignments sa WHERE sa.sample_id = s.id
        )
      `).get();

      res.json({
        overall,
        perUser,
        perDataset,
        unassigned: unassigned.count
      });
    } catch (error) {
      console.error('Get assignment stats error:', error);
      res.status(500).json({ error: 'Failed to get assignment statistics' });
    }
  });
}

