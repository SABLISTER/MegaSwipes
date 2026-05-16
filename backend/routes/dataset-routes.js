/**
 * Dataset Routes
 * 
 * Handles dataset retrieval and access control
 */

import db from '../database.js';
import { checkDatasetAccess } from '../utils/access-control.js';

/**
 * Register dataset routes
 * @param {Express} app - Express application instance
 * @param {Function} requireAuth - Authentication middleware
 */
export function registerDatasetRoutes(app, requireAuth) {
  /**
   * GET /api/datasets
   * Get all accessible datasets for current user
   */
  app.get('/api/datasets', requireAuth, (req, res) => {
    try {
      const datasets = db.prepare(`
        SELECT d.*, 
          s.name as study_name,
          (SELECT COUNT(*) FROM samples WHERE dataset_id = d.id) as sample_count,
          (SELECT COUNT(DISTINCT 
            CASE 
              WHEN file_path LIKE 'sub-%/%' THEN 
                SUBSTR(file_path, 1, INSTR(file_path, '/') - 1)
              WHEN file_path LIKE '%/sub-%/%' THEN 
                SUBSTR(file_path, INSTR(file_path, '/sub-') + 1, INSTR(SUBSTR(file_path, INSTR(file_path, '/sub-') + 1), '/') - 1)
              ELSE NULL
            END
          ) FROM samples WHERE dataset_id = d.id AND file_path IS NOT NULL) as subject_count
        FROM datasets d
        JOIN studies s ON d.study_id = s.id
        WHERE d.is_public = 1
           OR EXISTS (
             SELECT 1 FROM user_dataset_access uda
             WHERE uda.dataset_id = d.id AND uda.user_id = ?
           )
        ORDER BY d.created_at DESC
      `).all(req.user.id);

      res.json(datasets);
    } catch (error) {
      console.error('Get datasets error:', error);
      res.status(500).json({ error: 'Failed to get datasets' });
    }
  });

  /**
   * GET /api/datasets/:id
   * Get dataset details
   */
  app.get('/api/datasets/:id', requireAuth, (req, res) => {
    try {
      const dataset = db.prepare(`
        SELECT d.*, s.name as study_name,
          (SELECT COUNT(*) FROM samples WHERE dataset_id = d.id) as sample_count,
          (SELECT COUNT(DISTINCT 
            CASE 
              WHEN file_path LIKE 'sub-%/%' THEN 
                SUBSTR(file_path, 1, INSTR(file_path, '/') - 1)
              WHEN file_path LIKE '%/sub-%/%' THEN 
                SUBSTR(file_path, INSTR(file_path, '/sub-') + 1, INSTR(SUBSTR(file_path, INSTR(file_path, '/sub-') + 1), '/') - 1)
              ELSE NULL
            END
          ) FROM samples WHERE dataset_id = d.id AND file_path IS NOT NULL) as subject_count
        FROM datasets d
        JOIN studies s ON d.study_id = s.id
        WHERE d.id = ?
      `).get(req.params.id);

      if (!dataset) {
        return res.status(404).json({ error: 'Dataset not found' });
      }

      // Check access
      if (!checkDatasetAccess(req.params.id, req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json(dataset);
    } catch (error) {
      console.error('Get dataset error:', error);
      res.status(500).json({ error: 'Failed to get dataset' });
    }
  });
}

