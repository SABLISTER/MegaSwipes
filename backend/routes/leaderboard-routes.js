/**
 * Leaderboard Routes
 * 
 * Handles leaderboard retrieval
 */

import db from '../database.js';

/**
 * Register leaderboard routes
 * @param {Express} app - Express application instance
 * @param {Function} requireAuth - Authentication middleware
 */
export function registerLeaderboardRoutes(app, requireAuth) {
  /**
   * GET /api/leaderboard
   * Get leaderboard
   */
  app.get('/api/leaderboard', requireAuth, (req, res) => {
    try {
      const leaderboard = db.prepare(`
        SELECT 
          username,
          total_score,
          (SELECT COUNT(*) FROM votes WHERE user_id = users.id) as vote_count,
          created_at
        FROM users
        WHERE total_score > 0
        ORDER BY total_score DESC, vote_count DESC
        LIMIT 100
      `).all();

      res.json(leaderboard);
    } catch (error) {
      console.error('Get leaderboard error:', error);
      res.status(500).json({ error: 'Failed to get leaderboard' });
    }
  });
}

