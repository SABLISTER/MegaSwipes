/**
 * Admin User Management Routes
 * 
 * Handles admin operations for user management
 */

import db from '../database.js';

/**
 * Register admin user routes
 * @param {Express} app - Express application instance
 * @param {Function} requireAuth - Authentication middleware
 * @param {Function} requireAdmin - Admin authentication middleware
 */
import { hashPassword } from '../auth.js';

export function registerAdminUserRoutes(app, requireAuth, requireAdmin) {
  /**
   * GET /api/admin/users
   * List all users with statistics
   */
  app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
    try {
      const users = db.prepare(`
        SELECT 
          u.id,
          u.username,
          u.email,
          u.total_score,
          u.is_admin,
          u.consent_given,
          u.created_at,
          (SELECT COUNT(*) FROM votes WHERE user_id = u.id) as vote_count
        FROM users u
        ORDER BY u.created_at DESC
      `).all();

      res.json(users);
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  });

  /**
   * POST /api/admin/users
   * Create a new user (admin util)
   */
  app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username, email, password, is_admin } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required' });
      }

      // Check existence
      const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
      if (existing) {
        return res.status(400).json({ error: 'User already exists' });
      }

      const passwordHash = await hashPassword(password);
      const userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      db.prepare(`
        INSERT INTO users (id, username, email, password_hash, is_admin, consent_given, created_at)
        VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      `).run(userId, username, email, passwordHash, is_admin ? 1 : 0);

      const user = db.prepare('SELECT id, username, email, is_admin, created_at FROM users WHERE id = ?').get(userId);
      res.json(user);
    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  /**
   * POST /api/admin/users/:id/reset-password
   * Reset user password to provided value or default
   */
  app.post('/api/admin/users/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { password } = req.body;
      const targetPassword = password || 'test1234'; // Default if not provided

      const passwordHash = await hashPassword(targetPassword);

      const result = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, req.params.id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  /**
   * GET /api/admin/users/:id
   * Get single user with detailed statistics
   */
  app.get('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
    try {
      const user = db.prepare(`
        SELECT 
          id,
          username,
          email,
          total_score,
          is_admin,
          consent_given,
          created_at,
          updated_at
        FROM users
        WHERE id = ?
      `).get(req.params.id);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get vote history with secure_token for image access
      const votes = db.prepare(`
        SELECT 
          v.id,
          v.sample_id,
          v.rating,
          v.comment,
          v.created_at,
          s.filename,
          s.secure_token,
          d.name as dataset_name
        FROM votes v
        JOIN samples s ON v.sample_id = s.id
        JOIN datasets d ON s.dataset_id = d.id
        WHERE v.user_id = ?
        ORDER BY v.created_at DESC
      `).all(req.params.id);

      // Get dataset access
      const access = db.prepare(`
        SELECT 
          uda.dataset_id,
          d.name as dataset_name,
          uda.access_granted_at
        FROM user_dataset_access uda
        JOIN datasets d ON uda.dataset_id = d.id
        WHERE uda.user_id = ?
      `).all(req.params.id);

      res.json({ ...user, votes, access });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  /**
   * PUT /api/admin/users/:id
   * Update user (admin status, username, email)
   */
  app.put('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
    try {
      const { username, email, is_admin } = req.body;
      const updates = [];
      const values = [];

      if (username !== undefined) {
        updates.push('username = ?');
        values.push(username);
      }
      if (email !== undefined) {
        updates.push('email = ?');
        values.push(email);
      }
      if (is_admin !== undefined) {
        updates.push('is_admin = ?');
        values.push(is_admin ? 1 : 0);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(req.params.id);

      db.prepare(`
        UPDATE users
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...values);

      const user = db.prepare('SELECT id, username, email, is_admin, total_score, created_at FROM users WHERE id = ?').get(req.params.id);
      res.json(user);
    } catch (error) {
      console.error('Update user error:', error);
      if (error.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'Username or email already exists' });
      } else {
        res.status(500).json({ error: 'Failed to update user' });
      }
    }
  });

  /**
   * DELETE /api/admin/users/:id
   * Delete user (cascades to votes and access grants)
   */
  app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
    try {
      // Prevent deleting yourself
      if (req.params.id === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });
}

