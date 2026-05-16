/**
 * Authentication Routes
 * 
 * Handles user authentication: signup, login, logout, and current user retrieval
 */

import db from '../database.js';
import {
  generateToken,
  comparePassword,
  hashPassword,
  logout
} from '../auth.js';

/**
 * Register authentication routes
 * @param {Express} app - Express application instance
 * @param {Function} requireAuth - Authentication middleware
 */
export function registerAuthRoutes(app, requireAuth) {
  /**
   * POST /api/auth/signup
   * Create new user account
   */
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { username, email, password, consent } = req.body;

      // Validation
      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required' });
      }

      if (!consent) {
        return res.status(400).json({ error: 'Consent is required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      // Check if user already exists
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email or username already exists' });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      const userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      db.prepare(`
        INSERT INTO users (id, username, email, password_hash, consent_given)
        VALUES (?, ?, ?, ?, 1)
      `).run(userId, username, email, passwordHash);

      // Get created user
      const user = db.prepare('SELECT id, username, email, is_admin, created_at FROM users WHERE id = ?').get(userId);

      // Generate token
      const token = generateToken(user);

      // Set cookie (secure: false for HTTP on local network)
      res.cookie('token', token, {
        httpOnly: true,
        secure: false, // HTTP on local network
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({ user, token });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Failed to create account' });
    }
  });

  /**
   * POST /api/auth/login
   * Login with email and password
   */
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      // Get user
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Verify password
      const passwordValid = await comparePassword(password, user.password_hash);

      if (!passwordValid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Generate token
      const token = generateToken(user);

      // Set cookie (secure: false for HTTP on local network)
      res.cookie('token', token, {
        httpOnly: true,
        secure: false, // HTTP on local network
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      // Remove password hash from response
      delete user.password_hash;

      res.json({ user, token });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Failed to login' });
    }
  });

  /**
   * POST /api/auth/logout
   * Logout and invalidate session
   */
  app.post('/api/auth/logout', requireAuth, (req, res) => {
    try {
      const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
      logout(token);
      res.clearCookie('token');
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Failed to logout' });
    }
  });

  /**
   * GET /api/auth/me
   * Get current user
   */
  app.get('/api/auth/me', requireAuth, (req, res) => {
    try {
      const user = db.prepare('SELECT id, username, email, total_score, is_admin, created_at FROM users WHERE id = ?').get(req.user.id);
      res.json({ user });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: 'Failed to get user' });
    }
  });
}

