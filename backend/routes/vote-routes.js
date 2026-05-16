/**
 * Vote Routes
 * 
 * Handles voting functionality: creating votes and retrieving user votes
 */

import db from '../database.js';
import { checkDatasetAccess } from '../utils/access-control.js';

/**
 * Register vote routes
 * @param {Express} app - Express application instance
 * @param {Function} requireAuth - Authentication middleware
 */
export function registerVoteRoutes(app, requireAuth) {
  /**
   * POST /api/votes
   * Record a vote
   */
  app.post('/api/votes', requireAuth, (req, res) => {
    try {
      const { sample_id, vote, rating, comment } = req.body;

      if (!sample_id || rating === undefined) {
        return res.status(400).json({ error: 'sample_id and rating are required' });
      }

      // Check if sample exists and user has access
      const sample = db.prepare(`
        SELECT s.*, d.is_public, d.id as dataset_id
        FROM samples s
        JOIN datasets d ON s.dataset_id = d.id
        WHERE s.id = ?
      `).get(sample_id);

      if (!sample) {
        return res.status(404).json({ error: 'Sample not found' });
      }

      if (!checkDatasetAccess(sample.dataset_id, req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Upsert vote
      const result = db.prepare(`
        INSERT INTO votes (user_id, sample_id, vote, rating, comment)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, sample_id) DO UPDATE SET
          vote = excluded.vote,
          rating = excluded.rating,
          comment = excluded.comment,
          updated_at = CURRENT_TIMESTAMP
      `).run(req.user.id, sample_id, vote, rating, comment || null);

      res.json({ success: true, vote_id: result.lastInsertRowid });
    } catch (error) {
      console.error('Vote error:', error);
      res.status(500).json({ error: 'Failed to record vote' });
    }
  });

  /**
   * GET /api/votes/my
   * Get current user's votes
   */
  app.get('/api/votes/my', requireAuth, (req, res) => {
    try {
      const votes = db.prepare(`
        SELECT v.*, s.filename, d.name as dataset_name
        FROM votes v
        JOIN samples s ON v.sample_id = s.id
        JOIN datasets d ON s.dataset_id = d.id
        WHERE v.user_id = ?
        ORDER BY v.created_at DESC
      `).all(req.user.id);

      res.json(votes);
    } catch (error) {
      console.error('Get votes error:', error);
      res.status(500).json({ error: 'Failed to get votes' });
    }
  });
}

