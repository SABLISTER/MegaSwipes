import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import db from './database.js';

// JWT secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(64).toString('hex');
const JWT_EXPIRES_IN = '7d'; // 7 days

/**
 * Generate JWT token for user
 */
export function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    is_admin: user.is_admin
  };
  
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  
  // Store session in database
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO sessions (user_id, token, expires_at)
    VALUES (?, ?, ?)
  `).run(user.id, token, expiresAt);
  
  return token;
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if session exists and is not expired
    const session = db.prepare(`
      SELECT * FROM sessions 
      WHERE token = ? AND expires_at > datetime('now')
    `).get(token);
    
    if (!session) {
      return null;
    }
    
    return decoded;
  } catch (err) {
    return null;
  }
}

/**
 * Hash password
 */
export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Authentication middleware
 */
export function requireAuth(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = verifyToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  req.user = user;
  next();
}

/**
 * Admin middleware
 */
export function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Logout (invalidate session)
 */
export function logout(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/**
 * Clean up expired sessions
 */
export function cleanupExpiredSessions() {
  const result = db.prepare(`
    DELETE FROM sessions WHERE expires_at < datetime('now')
  `).run();
  
  if (result.changes > 0) {
    console.log(`🧹 Cleaned up ${result.changes} expired sessions`);
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

