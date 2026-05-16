/**
 * Sample Routes
 * 
 * Handles sample retrieval and access control
 */

import db from '../database.js';
import { checkDatasetAccess, isUserAdmin } from '../utils/access-control.js';

/**
 * Register sample routes
 * @param {Express} app - Express application instance
 * @param {Function} requireAuth - Authentication middleware
 */
export function registerSampleRoutes(app, requireAuth) {
  /**
   * GET /api/datasets/:datasetId/samples
   * Get all samples for a dataset
   */
  app.get('/api/datasets/:datasetId/samples', requireAuth, (req, res) => {
    try {
      const { datasetId } = req.params;

      // Check dataset access
      if (!checkDatasetAccess(datasetId, req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const isAdmin = isUserAdmin(req.user.id);

      // Check if there are any sample assignments for this user in this dataset
      // If assignments exist, filter to only show assigned samples
      // Otherwise, show all samples (backward compatibility)
      const hasAssignments = db.prepare(`
        SELECT COUNT(*) as count
        FROM sample_assignments
        WHERE dataset_id = ? AND user_id = ?
      `).get(datasetId, req.user.id);

      let samples;
      if (hasAssignments.count > 0) {
        // Filter by assignments - user only sees their assigned samples
        samples = db.prepare(`
          SELECT s.id,
            s.dataset_id,
            ${isAdmin ? 's.filename,' : ''}
            ${isAdmin ? 's.file_path,' : ''}
            s.secure_token,
            s.vote_count,
            s.average_rating,
            s.created_at,
            EXISTS(SELECT 1 FROM votes WHERE sample_id = s.id AND user_id = ?) as user_voted
          FROM samples s
          INNER JOIN sample_assignments sa ON s.id = sa.sample_id
          WHERE s.dataset_id = ?
            AND sa.dataset_id = ?
            AND sa.user_id = ?
          ORDER BY s.vote_count ASC, RANDOM()
        `).all(req.user.id, datasetId, datasetId, req.user.id);
      } else {
        // No assignments - show all samples (backward compatibility)
        samples = db.prepare(`
          SELECT s.id,
            s.dataset_id,
            ${isAdmin ? 's.filename,' : ''}
            ${isAdmin ? 's.file_path,' : ''}
            s.secure_token,
            s.vote_count,
            s.average_rating,
            s.created_at,
            EXISTS(SELECT 1 FROM votes WHERE sample_id = s.id AND user_id = ?) as user_voted
          FROM samples s
          WHERE s.dataset_id = ?
          ORDER BY s.vote_count ASC, RANDOM()
        `).all(req.user.id, datasetId);
      }

      res.json(samples);
    } catch (error) {
      console.error('Get samples error:', error);
      res.status(500).json({ error: 'Failed to get samples' });
    }
  });

  /**
   * GET /api/samples/:id
   * Get sample details
   */
  app.get('/api/samples/:id', requireAuth, (req, res) => {
    try {
      const isAdmin = isUserAdmin(req.user.id);

      const sample = db.prepare(`
        SELECT s.id,
          s.dataset_id,
          ${isAdmin ? 's.filename,' : ''}
          ${isAdmin ? 's.file_path,' : ''}
          s.secure_token,
          s.vote_count,
          s.average_rating,
          s.created_at,
          d.is_public
        FROM samples s
        JOIN datasets d ON s.dataset_id = d.id
        WHERE s.id = ?
      `).get(req.params.id);

      if (!sample) {
        return res.status(404).json({ error: 'Sample not found' });
      }

      // Check access
      if (!checkDatasetAccess(sample.dataset_id, req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(sample);
    } catch (error) {
      console.error('Get sample error:', error);
      res.status(500).json({ error: 'Failed to get sample' });
    }
  });
}

