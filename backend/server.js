import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import db from './database.js';
import {
  requireAuth,
  requireAdmin
} from './auth.js';
import { registerSplitRoutes } from './split-routes.js';

// Route modules
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerDatasetRoutes } from './routes/dataset-routes.js';
import { registerSampleRoutes } from './routes/sample-routes.js';
import { registerVoteRoutes } from './routes/vote-routes.js';
import { registerLeaderboardRoutes } from './routes/leaderboard-routes.js';
import { registerImageRoutes } from './routes/image-routes.js';
import { registerAdminUserRoutes } from './routes/admin-user-routes.js';
import { registerUploadRoutes } from './routes/upload-routes.js';
import { registerAssignmentRoutes } from './routes/assignment-routes.js';
import { registerExportRoutes } from './routes/export-routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// LOGGING SETUP
// ============================================================================

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create write streams for log files
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, 'access.log'),
  { flags: 'a' }
);

const errorLogStream = fs.createWriteStream(
  path.join(logsDir, 'error.log'),
  { flags: 'a' }
);

const appLogStream = fs.createWriteStream(
  path.join(logsDir, 'app.log'),
  { flags: 'a' }
);

// Helper to format log timestamp
const getTimestamp = () => new Date().toISOString();

// Intercept console.log and console.error to also write to files
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
  const message = `[${getTimestamp()}] [INFO] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
  appLogStream.write(message);
  originalConsoleLog.apply(console, args);
};

console.error = (...args) => {
  const message = `[${getTimestamp()}] [ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
  errorLogStream.write(message);
  appLogStream.write(message);
  originalConsoleError.apply(console, args);
};

// Log startup
console.log('='.repeat(60));
console.log('Server starting...');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"]
    }
  }
}));
// CORS: Allow local network origins (permissive for VPN/local network)
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow megaswipes (without .local) on any port
    if (/^http:\/\/megaswipes(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // Allow localhost and IP addresses
    const allowedOrigins = [
      'http://localhost:5173',
      'http://192.168.153.28:5173',
      'http://10.62.160.44:5173',
      'http://169.254.96.197:5173',
      'http://169.254.131.225:5173',
    ];

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow any IP address on port 5173 (for local network flexibility)
    if (/^http:\/\/\d+\.\d+\.\d+\.\d+:5173$/.test(origin)) {
      return callback(null, true);
    }

    // Default: allow (permissive for local network)
    callback(null, true);
  },
  credentials: true
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/api/', limiter);

// HTTP request logging with morgan
// Log to file (combined format - detailed)
app.use(morgan('combined', { stream: accessLogStream }));
// Also log to console (dev format - concise)
app.use(morgan('dev'));

// ============================================================================
// ACME CHALLENGE (Let's Encrypt DNS-01)
// ============================================================================
// Serve ACME challenge files for Let's Encrypt SSL certificate validation
// This must be accessible without authentication
const acmeChallengePath = path.join(__dirname, '.well-known', 'acme-challenge');
app.use('/.well-known/acme-challenge', express.static(acmeChallengePath));

// ============================================================================
// REGISTER ROUTES
// ============================================================================

// Register route modules
registerAuthRoutes(app, requireAuth);
registerDatasetRoutes(app, requireAuth);
registerSampleRoutes(app, requireAuth);
registerVoteRoutes(app, requireAuth);
registerLeaderboardRoutes(app, requireAuth);
registerImageRoutes(app, requireAuth);
registerAdminUserRoutes(app, requireAuth, requireAdmin);
registerUploadRoutes(app, requireAuth, requireAdmin);
registerAssignmentRoutes(app, requireAuth, requireAdmin);
registerExportRoutes(app, requireAuth, requireAdmin);
import { registerAdminDatabaseRoutes } from './routes/admin-database-routes.js';
import { registerAdminResourceRoutes } from './routes/admin-resource-routes.js';
import { registerQCRoutes } from './routes/qc-data-routes.js';
registerSplitRoutes(app, db, requireAuth, requireAdmin);
registerAdminDatabaseRoutes(app, requireAuth, requireAdmin);
registerAdminResourceRoutes(app, requireAuth, requireAdmin);
registerQCRoutes(app, requireAuth, requireAdmin);

// ============================================================================
// NOTE: Route handlers have been moved to separate modules in backend/routes/
// See route registrations above
// ============================================================================

// ============================================================================
// ADMIN ROUTES
// ============================================================================

// Note: Admin routes have been modularized.
// - Users: backend/routes/admin-user-routes.js
// - Resources (Studies/Datasets/Samples/Access): backend/routes/admin-resource-routes.js
// - Database: backend/routes/admin-database-routes.js

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * GET /api/admin/swipe-stats
 * Get comprehensive swipe/vote statistics (per dataset, per study, per image)
 */
app.get('/api/admin/swipe-stats', requireAuth, requireAdmin, (req, res) => {
  try {
    // Overall statistics
    const overall = db.prepare(`
      SELECT 
        COUNT(*) as total_votes,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as pass_count,
        SUM(CASE WHEN rating = 0 THEN 1 ELSE 0 END) as fail_count,
        ROUND(100.0 * SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as pass_percentage,
        ROUND(100.0 * SUM(CASE WHEN rating = 0 THEN 1 ELSE 0 END) / COUNT(*), 2) as fail_percentage,
        COUNT(DISTINCT user_id) as unique_voters,
        COUNT(DISTINCT sample_id) as unique_samples_voted,
        COUNT(DISTINCT s.dataset_id) as unique_datasets_voted,
        (SELECT COUNT(*) FROM samples WHERE euler_number IS NOT NULL) as samples_with_euler
      FROM votes v
      JOIN samples s ON v.sample_id = s.id
    `).get();

    // Per study statistics
    const perStudy = db.prepare(`
      SELECT 
        st.id,
        st.name,
        COUNT(DISTINCT d.id) as dataset_count,
        COUNT(DISTINCT s.id) as total_images,
        COUNT(DISTINCT 
          CASE 
            WHEN s.file_path LIKE 'sub-%/%' THEN 
              SUBSTR(s.file_path, 1, INSTR(s.file_path, '/') - 1)
            WHEN s.file_path LIKE '%/sub-%/%' THEN 
              SUBSTR(s.file_path, INSTR(s.file_path, '/sub-') + 1, INSTR(SUBSTR(s.file_path, INSTR(s.file_path, '/sub-') + 1), '/') - 1)
            ELSE NULL
          END
        ) as subject_count,
        COUNT(v.id) as total_votes,
        SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) as pass_count,
        SUM(CASE WHEN v.rating = 0 THEN 1 ELSE 0 END) as fail_count,
        ROUND(100.0 * SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(v.id), 0), 2) as pass_percentage,
        ROUND(100.0 * SUM(CASE WHEN v.rating = 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(v.id), 0), 2) as fail_percentage,
        COUNT(DISTINCT v.sample_id) as samples_voted,
        COUNT(DISTINCT v.user_id) as unique_voters
      FROM studies st
      LEFT JOIN datasets d ON st.id = d.study_id
      LEFT JOIN samples s ON d.id = s.dataset_id
      LEFT JOIN votes v ON s.id = v.sample_id
      GROUP BY st.id, st.name
      ORDER BY st.name
    `).all();

    // Per dataset statistics
    const perDataset = db.prepare(`
      SELECT 
        d.id,
        d.name,
        d.study_id,
        st.name as study_name,
        COUNT(DISTINCT s.id) as total_samples,
        COUNT(DISTINCT 
          CASE 
            WHEN s.file_path LIKE 'sub-%/%' THEN 
              SUBSTR(s.file_path, 1, INSTR(s.file_path, '/') - 1)
            WHEN s.file_path LIKE '%/sub-%/%' THEN 
              SUBSTR(s.file_path, INSTR(s.file_path, '/sub-') + 1, INSTR(SUBSTR(s.file_path, INSTR(s.file_path, '/sub-') + 1), '/') - 1)
            ELSE NULL
          END
        ) as subject_count,
        COUNT(v.id) as total_votes,
        SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) as pass_count,
        SUM(CASE WHEN v.rating = 0 THEN 1 ELSE 0 END) as fail_count,
        ROUND(100.0 * SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(v.id), 0), 2) as pass_percentage,
        ROUND(100.0 * SUM(CASE WHEN v.rating = 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(v.id), 0), 2) as fail_percentage,
        COUNT(DISTINCT v.sample_id) as samples_voted,
        ROUND(100.0 * COUNT(DISTINCT v.sample_id) / NULLIF(COUNT(DISTINCT s.id), 0), 2) as completion_percentage,
        COUNT(DISTINCT v.user_id) as unique_voters,
        ROUND(AVG(v.rating), 3) as average_rating
      FROM datasets d
      JOIN studies st ON d.study_id = st.id
      LEFT JOIN samples s ON d.id = s.dataset_id
      LEFT JOIN votes v ON s.id = v.sample_id
      GROUP BY d.id, d.name, d.study_id, st.name
      ORDER BY d.name
    `).all();

    // Per image statistics (top voted and most problematic)
    const perImage = db.prepare(`
      SELECT 
        s.id,
        s.filename,
        s.dataset_id,
        d.name as dataset_name,
        d.study_id,
        st.name as study_name,
        COUNT(v.id) as vote_count,
        SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) as pass_count,
        SUM(CASE WHEN v.rating = 0 THEN 1 ELSE 0 END) as fail_count,
        ROUND(100.0 * SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(v.id), 0), 2) as pass_percentage,
        ROUND(100.0 * SUM(CASE WHEN v.rating = 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(v.id), 0), 2) as fail_percentage,
        ROUND(AVG(v.rating), 3) as average_rating,
        COUNT(DISTINCT v.user_id) as unique_voters,
        MAX(v.created_at) as last_voted_at
      FROM samples s
      JOIN datasets d ON s.dataset_id = d.id
      JOIN studies st ON d.study_id = st.id
      LEFT JOIN votes v ON s.id = v.sample_id
      GROUP BY s.id, s.filename, s.dataset_id, d.name, d.study_id, st.name
      HAVING COUNT(v.id) > 0
      ORDER BY vote_count DESC, fail_count DESC
      LIMIT 100
    `).all();

    // Per rater/user statistics
    const perRater = db.prepare(`
      SELECT 
        u.id,
        u.username,
        COUNT(v.id) as total_votes,
        SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) as pass_count,
        SUM(CASE WHEN v.rating = 0 THEN 1 ELSE 0 END) as fail_count,
        ROUND(100.0 * SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(v.id), 0), 2) as pass_percentage,
        ROUND(100.0 * SUM(CASE WHEN v.rating = 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(v.id), 0), 2) as fail_percentage,
        COUNT(DISTINCT v.sample_id) as unique_samples_voted,
        COUNT(DISTINCT s.dataset_id) as unique_datasets_voted,
        COUNT(DISTINCT d.study_id) as unique_studies_voted,
        ROUND(AVG(v.rating), 3) as average_rating,
        u.total_score,
        MIN(v.created_at) as first_vote_at,
        MAX(v.created_at) as last_vote_at
      FROM users u
      LEFT JOIN votes v ON u.id = v.user_id
      LEFT JOIN samples s ON v.sample_id = s.id
      LEFT JOIN datasets d ON s.dataset_id = d.id
      WHERE v.id IS NOT NULL
      GROUP BY u.id, u.username, u.total_score
      ORDER BY total_votes DESC
    `).all();

    // Recent votes (last 50)
    const recentVotes = db.prepare(`
      SELECT 
        v.id,
        v.rating,
        v.comment,
        v.created_at,
        u.username,
        s.filename,
        d.name as dataset_name,
        st.name as study_name
      FROM votes v
      JOIN users u ON v.user_id = u.id
      JOIN samples s ON v.sample_id = s.id
      JOIN datasets d ON s.dataset_id = d.id
      JOIN studies st ON d.study_id = st.id
      ORDER BY v.created_at DESC
      LIMIT 50
    `).all();

    res.json({
      overall,
      perStudy,
      perDataset,
      perImage,
      perRater,
      recentVotes,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get swipe stats error:', error);
    res.status(500).json({ error: 'Failed to get swipe statistics' });
  }
});

/**
 * GET /api/admin/stats/advanced
 * Get advanced QC statistics for visualizations
 */
app.get('/api/admin/stats/advanced', requireAuth, requireAdmin, (req, res) => {
  try {
    // Helper function to extract subject ID from filename
    const extractSubjectId = (filename) => {
      if (!filename) return null;
      const underscoreIndex = filename.indexOf('_');
      if (underscoreIndex > 0) {
        return filename.substring(0, underscoreIndex);
      }
      const dotIndex = filename.lastIndexOf('.');
      if (dotIndex > 0) {
        return filename.substring(0, dotIndex);
      }
      return filename;
    };

    // Helper function to extract image position/type from filename
    // Looks for patterns like _A1, _A2, _S1, _S2, or position in sorted list
    const extractImagePosition = (filename, allFilenamesForSubject) => {
      // Try to extract from filename patterns
      const patterns = [
        /_A1[._]/, /_A2[._]/, /_A3[._]/, /_A4[._]/,
        /_S1[._]/, /_S2[._]/, /_S3[._]/, /_S4[._]/,
        /_C1[._]/, /_C2[._]/, /_C3[._]/, /_C4[._]/
      ];

      for (let i = 0; i < patterns.length; i++) {
        if (patterns[i].test(filename)) {
          return `Image ${(i % 4) + 1}`;
        }
      }

      // Fallback: use position in sorted list
      if (allFilenamesForSubject && allFilenamesForSubject.length > 0) {
        const sorted = [...allFilenamesForSubject].sort();
        const index = sorted.indexOf(filename);
        return index >= 0 ? `Image ${index + 1}` : 'Unknown';
      }

      return 'Unknown';
    };

    // 1. Pass-rate per scan (grouped by subject)
    const allSamples = db.prepare(`
      SELECT 
        s.id,
        s.filename,
        s.file_path,
        s.dataset_id,
        d.name as dataset_name,
        st.name as study_name
      FROM samples s
      JOIN datasets d ON s.dataset_id = d.id
      JOIN studies st ON d.study_id = st.id
    `).all();

    // Group samples by subject (scan)
    const scansBySubject = new Map();
    allSamples.forEach(sample => {
      const subjectId = extractSubjectId(sample.filename);
      if (!subjectId) return;

      if (!scansBySubject.has(subjectId)) {
        scansBySubject.set(subjectId, {
          subject_id: subjectId,
          dataset_id: sample.dataset_id,
          dataset_name: sample.dataset_name,
          study_name: sample.study_name,
          images: []
        });
      }
      scansBySubject.get(subjectId).images.push(sample);
    });

    // Calculate pass rate per scan
    const scanPassRates = [];
    for (const [subjectId, scan] of scansBySubject.entries()) {
      let totalVotes = 0;
      let goodVotes = 0;

      for (const image of scan.images) {
        const votes = db.prepare(`
          SELECT rating FROM votes WHERE sample_id = ?
        `).all(image.id);

        for (const vote of votes) {
          totalVotes++;
          if (vote.rating === 1) goodVotes++;
        }
      }

      if (totalVotes > 0) {
        scanPassRates.push({
          subject_id: subjectId,
          dataset_name: scan.dataset_name,
          study_name: scan.study_name,
          pass_rate: goodVotes / totalVotes,
          total_votes: totalVotes,
          good_votes: goodVotes,
          image_count: scan.images.length
        });
      }
    }

    // 2. Image-level pass rates (by image position)
    const imagePassRates = [];
    const imagePositionMap = new Map();

    // First, group images by subject to determine positions
    for (const [subjectId, scan] of scansBySubject.entries()) {
      const filenames = scan.images.map(img => img.filename);
      scan.images.forEach((image, idx) => {
        const position = extractImagePosition(image.filename, filenames);
        const key = `${position}_${image.dataset_id}`;

        if (!imagePositionMap.has(key)) {
          imagePositionMap.set(key, {
            image_position: position,
            dataset_id: image.dataset_id,
            dataset_name: image.dataset_name,
            total_votes: 0,
            good_votes: 0
          });
        }

        const stats = imagePositionMap.get(key);
        const votes = db.prepare(`
          SELECT rating FROM votes WHERE sample_id = ?
        `).all(image.id);

        votes.forEach(vote => {
          stats.total_votes++;
          if (vote.rating === 1) stats.good_votes++;
        });
      });
    }

    imagePositionMap.forEach(stats => {
      if (stats.total_votes > 0) {
        imagePassRates.push({
          image_position: stats.image_position,
          dataset_name: stats.dataset_name,
          pass_rate: stats.good_votes / stats.total_votes,
          total_votes: stats.total_votes,
          good_votes: stats.good_votes
        });
      }
    });

    // 3. Rater behavior
    const raterStats = db.prepare(`
      SELECT 
        u.id,
        u.username,
        u.is_admin,
        COUNT(v.id) as total_votes,
        SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) as good_votes,
        ROUND(100.0 * SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(v.id), 0), 2) as pass_rate
      FROM users u
      LEFT JOIN votes v ON u.id = v.user_id
      WHERE v.id IS NOT NULL
      GROUP BY u.id, u.username, u.is_admin
      ORDER BY total_votes DESC
    `).all();

    // 4. Inter-rater agreement for power users (admin users)
    const powerUserIds = db.prepare(`
      SELECT id FROM users WHERE is_admin = 1
    `).all().map(u => u.id);

    const interRaterAgreement = [];
    if (powerUserIds.length >= 2) {
      // For each scan rated by at least 2 power users
      for (const [subjectId, scan] of scansBySubject.entries()) {
        const powerUserVotes = new Map();

        for (const image of scan.images) {
          const votes = db.prepare(`
            SELECT v.user_id, v.rating
            FROM votes v
            WHERE v.sample_id = ? AND v.user_id IN (${powerUserIds.map(() => '?').join(',')})
          `).all(image.id, ...powerUserIds);

          votes.forEach(vote => {
            if (!powerUserVotes.has(vote.user_id)) {
              powerUserVotes.set(vote.user_id, []);
            }
            powerUserVotes.get(vote.user_id).push(vote.rating);
          });
        }

        if (powerUserVotes.size >= 2) {
          // Calculate agreement: fraction of power users who voted good
          const allRatings = [];
          powerUserVotes.forEach(ratings => {
            // Average rating per power user for this scan
            const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
            allRatings.push(avgRating);
          });

          const avgRating = allRatings.reduce((sum, r) => sum + r, 0) / allRatings.length;
          const agreement = avgRating; // 1 = all agree good, 0 = all agree bad

          interRaterAgreement.push({
            subject_id: subjectId,
            dataset_name: scan.dataset_name,
            power_user_count: powerUserVotes.size,
            agreement: agreement,
            fraction_good: agreement
          });
        }
      }
    }

    // 5. Pass rate over time
    const timeStats = db.prepare(`
      SELECT 
        DATE(v.created_at) as vote_date,
        COUNT(*) as total_votes,
        SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) as good_votes,
        ROUND(100.0 * SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) / COUNT(*), 2) as pass_rate
      FROM votes v
      GROUP BY DATE(v.created_at)
      ORDER BY vote_date ASC
    `).all();

    // 6. Fatigue per rater (votes ordered by time within sessions)
    const fatigueStats = [];
    const raterVotes = db.prepare(`
      SELECT 
        u.id as user_id,
        u.username,
        u.is_admin,
        v.id as vote_id,
        v.rating,
        v.created_at
      FROM users u
      JOIN votes v ON u.id = v.user_id
      ORDER BY u.id, v.created_at
    `).all();

    // Group by user and session (day) - calculate vote index manually
    const raterSessions = new Map();
    raterVotes.forEach((vote, globalIdx) => {
      const sessionDate = vote.created_at ? vote.created_at.split(' ')[0] : 'unknown';
      const sessionKey = `${vote.user_id || vote.id}_${sessionDate}`;

      if (!raterSessions.has(sessionKey)) {
        raterSessions.set(sessionKey, {
          user_id: vote.user_id || vote.id,
          username: vote.username,
          is_admin: vote.is_admin,
          session_date: sessionDate,
          votes: []
        });
      }

      // Calculate vote index within session
      const session = raterSessions.get(sessionKey);
      const voteIndex = session.votes.length + 1;
      session.votes.push({
        vote_index: voteIndex,
        rating: vote.rating
      });
    });

    // Calculate rolling pass rate per session
    raterSessions.forEach(session => {
      const votes = session.votes.sort((a, b) => a.vote_index - b.vote_index);
      let cumulativeGood = 0;
      let cumulativeTotal = 0;

      votes.forEach((vote) => {
        cumulativeTotal++;
        if (vote.rating === 1) cumulativeGood++;

        fatigueStats.push({
          user_id: session.user_id,
          username: session.username,
          is_admin: session.is_admin,
          session_date: session.session_date,
          vote_index: vote.vote_index,
          cumulative_pass_rate: cumulativeTotal > 0 ? cumulativeGood / cumulativeTotal : 0,
          rating: vote.rating
        });
      });
    });

    // 7. Entropy of votes per image
    const imageEntropy = [];
    allSamples.forEach(sample => {
      const votes = db.prepare(`
        SELECT rating FROM votes WHERE sample_id = ?
      `).all(sample.id);

      if (votes.length > 0) {
        const p = votes.filter(v => v.rating === 1).length / votes.length;
        let entropy = 0;
        if (p > 0 && p < 1) {
          entropy = -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
        }

        imageEntropy.push({
          sample_id: sample.id,
          filename: sample.filename,
          dataset_name: sample.dataset_name,
          entropy: entropy,
          pass_rate: p,
          total_votes: votes.length
        });
      }
    });

    // 8. Calibration plot (power users vs regular users)
    const calibrationData = [];
    for (const [subjectId, scan] of scansBySubject.entries()) {
      const powerUserVotes = [];
      const regularUserVotes = [];

      for (const image of scan.images) {
        const votes = db.prepare(`
          SELECT v.rating, u.is_admin
          FROM votes v
          JOIN users u ON v.user_id = u.id
          WHERE v.sample_id = ?
        `).all(image.id);

        votes.forEach(vote => {
          if (vote.is_admin === 1) {
            powerUserVotes.push(vote.rating);
          } else {
            regularUserVotes.push(vote.rating);
          }
        });
      }

      if (powerUserVotes.length > 0 && regularUserVotes.length > 0) {
        const powerPassRate = powerUserVotes.filter(r => r === 1).length / powerUserVotes.length;
        const regularPassRate = regularUserVotes.filter(r => r === 1).length / regularUserVotes.length;

        calibrationData.push({
          subject_id: subjectId,
          dataset_name: scan.dataset_name,
          power_pass_rate: powerPassRate,
          regular_pass_rate: regularPassRate,
          power_vote_count: powerUserVotes.length,
          regular_vote_count: regularUserVotes.length
        });
      }
    }

    // 9. Site Pass Rates
    // Extract site from dataset name or image path, then calc pass rate
    const sitePassRates = [];
    const siteGroups = new Map();

    allSamples.forEach(sample => {
      // Determine site (reuse logic from sites-euler)
      let site = sample.dataset_name;
      if (sample.dataset_name.includes('_')) {
        site = sample.dataset_name.split('_')[0];
      }
      // Fallback
      if (!site) site = sample.study_name;

      if (!siteGroups.has(site)) {
        siteGroups.set(site, { total: 0, passed: 0 });
      }

      // Check votes for this sample
      const votes = db.prepare('SELECT rating FROM votes WHERE sample_id = ?').all(sample.id);
      votes.forEach(v => {
        siteGroups.get(site).total++;
        if (v.rating === 1) siteGroups.get(site).passed++;
      });
    });

    siteGroups.forEach((stats, site) => {
      if (stats.total > 0) {
        sitePassRates.push({
          site: site,
          pass_rate: stats.passed / stats.total,
          total_votes: stats.total
        });
      }
    });

    // 10. Euler vs Pass Rate
    // Get samples that have both votes and euler_number
    const eulerVsPassRate = db.prepare(`
        SELECT 
          s.euler_number,
          s.filename,
          COUNT(v.id) as total_votes,
          SUM(CASE WHEN v.rating = 1 THEN 1 ELSE 0 END) as passed_votes
        FROM samples s
        JOIN votes v ON s.id = v.sample_id
        WHERE s.euler_number IS NOT NULL
        GROUP BY s.id
        HAVING total_votes > 0
    `).all().map(row => ({
      filename: row.filename,
      euler: row.euler_number,
      pass_rate: row.passed_votes / row.total_votes,
      total_votes: row.total_votes
    }));

    res.json({
      scanPassRates,
      imagePassRates,
      raterStats,
      interRaterAgreement,
      timeStats,
      fatigueStats,
      imageEntropy,
      calibrationData,
      sitePassRates, // New
      eulerVsPassRate, // New
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get advanced stats error:', error);
    res.status(500).json({ error: 'Failed to get advanced statistics: ' + error.message });
  }
});

/**
 * GET /api/admin/stats/sites-euler
 * Get euler number statistics aggregated by site
 */
app.get('/api/admin/stats/sites-euler', requireAuth, requireAdmin, (req, res) => {
  try {
    // Extract site information from filenames and calculate euler number statistics
    // Sites are typically identified by prefixes in filenames (e.g., "ABIDE_I", "HBN_CUNY", etc.)
    // Euler numbers might be in filenames or we need to extract them from metadata

    // Get all samples with their dataset and study info
    const samples = db.prepare(`
      SELECT 
        s.id,
        s.filename,
        s.file_path,
        s.euler_number,
        d.name as dataset_name,
        d.image_path,
        st.name as study_name
      FROM samples s
      JOIN datasets d ON s.dataset_id = d.id
      JOIN studies st ON d.study_id = st.id
    `).all();

    // Group samples by site (extract site from dataset name or image_path)
    const siteGroups = {};

    samples.forEach(sample => {
      // Try to extract site from dataset name or image_path
      // Common patterns: "ABIDE_I", "HBN_CUNY", "HBN_SI", etc.
      let site = sample.dataset_name;

      // If dataset name contains underscores, use the part before first underscore or the whole name
      if (sample.image_path) {
        // image_path often contains the site identifier
        const pathParts = sample.image_path.split('/');
        if (pathParts.length > 0) {
          site = pathParts[0];
        }
      }

      // Fallback: use study name if available
      if (!site || site === '') {
        site = sample.study_name || 'Unknown';
      }

      if (!siteGroups[site]) {
        siteGroups[site] = {
          site: site,
          samples: [],
          eulerNumbers: []
        };
      }

      siteGroups[site].samples.push(sample);

      // Use database column if available, otherwise try regex fallback
      if (sample.euler_number !== null && sample.euler_number !== undefined) {
        siteGroups[site].eulerNumbers.push(sample.euler_number);
      } else {
        // Fallback: Try regex
        const eulerMatch = sample.filename.match(/euler[_\s-]?(\d+\.?\d*)/i) ||
          sample.filename.match(/(\d+\.?\d*)[_\s-]?euler/i);

        if (eulerMatch) {
          const eulerValue = parseFloat(eulerMatch[1]);
          if (!isNaN(eulerValue)) {
            siteGroups[site].eulerNumbers.push(eulerValue);
          }
        }
      }
    });

    // Calculate statistics for each site
    const sitesStats = Object.values(siteGroups).map(group => {
      const eulerNumbers = group.eulerNumbers;

      if (eulerNumbers.length === 0) {
        // If no euler numbers found, return placeholder stats
        return {
          site: group.site,
          count: group.samples.length,
          mean: null,
          std: null,
          q1: null,
          median: null,
          q3: null,
          min: null,
          max: null
        };
      }

      // Sort euler numbers
      const sorted = [...eulerNumbers].sort((a, b) => a - b);
      const n = sorted.length;

      // Calculate quartiles using proper percentile calculation
      // Q1 (25th percentile), Median (50th percentile), Q3 (75th percentile)
      const calculatePercentile = (arr, percentile) => {
        if (arr.length === 0) return null;
        if (arr.length === 1) return arr[0];

        const index = (percentile / 100) * (arr.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;

        if (lower === upper) {
          return arr[lower];
        }
        return arr[lower] * (1 - weight) + arr[upper] * weight;
      };

      const q1 = calculatePercentile(sorted, 25);
      const median = calculatePercentile(sorted, 50);
      const q3 = calculatePercentile(sorted, 75);
      const iqr = q3 - q1;

      // Calculate whiskers: extend to 1.5 * IQR from quartiles, but not beyond actual min/max
      const lowerWhisker = Math.max(sorted[0], q1 - 1.5 * iqr);
      const upperWhisker = Math.min(sorted[n - 1], q3 + 1.5 * iqr);

      // Find outliers (points beyond whiskers)
      const outliers = sorted.filter(val => val < lowerWhisker || val > upperWhisker);

      const min = sorted[0];
      const max = sorted[n - 1];

      // Calculate mean
      const mean = eulerNumbers.reduce((sum, val) => sum + val, 0) / n;

      // Calculate standard deviation
      const variance = eulerNumbers.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
      const std = Math.sqrt(variance);

      return {
        site: group.site,
        count: n,
        mean: Math.round(mean * 100) / 100,
        std: Math.round(std * 100) / 100,
        q1: Math.round(q1 * 100) / 100,
        median: Math.round(median * 100) / 100,
        q3: Math.round(q3 * 100) / 100,
        iqr: Math.round(iqr * 100) / 100,
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        lowerWhisker: Math.round(lowerWhisker * 100) / 100,
        upperWhisker: Math.round(upperWhisker * 100) / 100,
        outliers: outliers.map(v => Math.round(v * 100) / 100)
      };
    });

    res.json(sitesStats);
  } catch (error) {
    console.error('Get sites euler stats error:', error);
    res.status(500).json({ error: 'Failed to get sites euler statistics' });
  }
});

/**
 * GET /api/admin/stats
 * Get system-wide statistics
 */
app.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => {
  try {
    // Total counts
    const totals = {
      users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
      studies: db.prepare('SELECT COUNT(*) as count FROM studies').get().count,
      datasets: db.prepare('SELECT COUNT(*) as count FROM datasets').get().count,
      samples: db.prepare('SELECT COUNT(*) as count FROM samples').get().count,
      votes: db.prepare('SELECT COUNT(*) as count FROM votes').get().count
    };

    // Recent activity (last 10 votes)
    const recentActivity = db.prepare(`
      SELECT 
        v.id,
        v.rating,
        v.created_at,
        u.username,
        s.filename,
        d.name as dataset_name
      FROM votes v
      JOIN users u ON v.user_id = u.id
      JOIN samples s ON v.sample_id = s.id
      JOIN datasets d ON s.dataset_id = d.id
      ORDER BY v.created_at DESC
      LIMIT 10
    `).all();

    // Top contributors (top 10 users by total_score)
    const topContributors = db.prepare(`
      SELECT 
        username,
        total_score,
        (SELECT COUNT(*) FROM votes WHERE user_id = users.id) as vote_count
      FROM users
      WHERE total_score > 0
      ORDER BY total_score DESC, vote_count DESC
      LIMIT 10
    `).all();

    // Dataset completion rates
    const datasetStats = db.prepare(`
      SELECT 
        d.id,
        d.name,
        (SELECT COUNT(*) FROM samples WHERE dataset_id = d.id) as total_samples,
        (SELECT COUNT(DISTINCT 
          CASE 
            WHEN file_path LIKE 'sub-%/%' THEN 
              SUBSTR(file_path, 1, INSTR(file_path, '/') - 1)
            WHEN file_path LIKE '%/sub-%/%' THEN 
              SUBSTR(file_path, INSTR(file_path, '/sub-') + 1, INSTR(SUBSTR(file_path, INSTR(file_path, '/sub-') + 1), '/') - 1)
            ELSE NULL
          END
        ) FROM samples WHERE dataset_id = d.id AND file_path IS NOT NULL) as subject_count,
        (SELECT COUNT(DISTINCT sample_id) FROM votes v JOIN samples s ON v.sample_id = s.id WHERE s.dataset_id = d.id) as voted_samples,
        (SELECT COUNT(*) FROM votes v JOIN samples s ON v.sample_id = s.id WHERE s.dataset_id = d.id) as total_votes,
        (SELECT AVG(vote_count) FROM samples WHERE dataset_id = d.id) as avg_votes_per_sample
      FROM datasets d
      ORDER BY d.name
    `).all();

    res.json({
      totals,
      recentActivity,
      topContributors,
      datasetStats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// ============================================================================
// SSH ADMIN ROUTES
// ============================================================================

/**
 * GET /api/admin/ssh/status
 * Check SSH connection status
 */
app.get('/api/admin/ssh/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const testResult = await sshService.testConnection();
    const cacheStats = sshService.getCacheStats();

    res.json({
      ...testResult,
      cache: cacheStats
    });
  } catch (error) {
    console.error('SSH status error:', error);
    res.status(500).json({ error: 'Failed to check SSH status' });
  }
});

/**
 * POST /api/admin/ssh/test
 * Test SSH connection
 */
app.post('/api/admin/ssh/test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await sshService.testConnection();
    res.json(result);
  } catch (error) {
    console.error('SSH test error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * POST /api/admin/ssh/scan
 * Scan SSH server for datasets (quick scan)
 */
app.post('/api/admin/ssh/scan', requireAuth, requireAdmin, async (req, res) => {
  try {
    const datasets = await sshService.scanDatasets();
    res.json({
      success: true,
      datasets,
      message: `Found ${datasets.length} datasets`
    });
  } catch (error) {
    console.error('SSH scan error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/ssh/import/:datasetName
 * Import specific dataset from SSH
 */
app.post('/api/admin/ssh/import/:datasetName', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { datasetName } = req.params;
    const { fullScan } = req.body;

    console.log(`📥 Importing SSH dataset: ${datasetName} (full: ${fullScan})`);

    // Get or create study
    let study = db.prepare('SELECT id FROM studies WHERE name = ?').get('CMI Brain Scan QC');
    if (!study) {
      const result = db.prepare(`
        INSERT INTO studies (name, description)
        VALUES (?, ?)
      `).run('CMI Brain Scan QC', 'Child Mind Institute neuroimaging quality control study');
      study = { id: result.lastInsertRowid };
    }

    // Scan dataset
    const datasetInfo = await sshService.scanDatasetDetail(datasetName);

    // Get or create dataset
    let dataset = db.prepare('SELECT id FROM datasets WHERE ssh_path = ?').get(datasetName);

    if (!dataset) {
      const result = db.prepare(`
        INSERT INTO datasets (study_id, name, description, image_path, ssh_path, is_ssh, is_public)
        VALUES (?, ?, ?, ?, ?, 1, 1)
      `).run(
        study.id,
        datasetName,
        `SSH dataset: ${datasetName} with ${datasetInfo.subjectCount} subjects`,
        datasetName,
        datasetName
      );
      dataset = { id: result.lastInsertRowid };
    }

    // Import samples
    const insertSample = db.prepare(`
      INSERT OR IGNORE INTO samples (dataset_id, filename, secure_token, file_path, ssh_path)
      VALUES (?, ?, ?, ?, ?)
    `);

    const { randomUUID } = await import('crypto');
    let imported = 0;

    const importTransaction = db.transaction((samples) => {
      for (const sample of samples) {
        const result = insertSample.run(
          dataset.id,
          sample.filename,
          randomUUID(),
          sample.path,
          sample.path
        );
        if (result.changes > 0) imported++;
      }
    });

    importTransaction(datasetInfo.samples);

    res.json({
      success: true,
      message: `Imported ${imported} samples from ${datasetName}`,
      imported,
      total: datasetInfo.imageCount
    });
  } catch (error) {
    console.error('SSH import error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/ssh/refresh/:datasetId
 * Refresh specific dataset from SSH
 */
app.post('/api/admin/ssh/refresh/:datasetId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { datasetId } = req.params;

    // Get dataset info
    const dataset = db.prepare('SELECT ssh_path, name FROM datasets WHERE id = ? AND is_ssh = 1').get(datasetId);

    if (!dataset) {
      return res.status(404).json({ error: 'SSH dataset not found' });
    }

    console.log(`🔄 Refreshing SSH dataset: ${dataset.name}`);

    // Scan dataset
    const datasetInfo = await sshService.scanDatasetDetail(dataset.ssh_path);

    // Clear existing samples
    db.prepare('DELETE FROM samples WHERE dataset_id = ?').run(datasetId);

    // Import samples
    const insertSample = db.prepare(`
      INSERT INTO samples (dataset_id, filename, secure_token, file_path, ssh_path)
      VALUES (?, ?, ?, ?, ?)
    `);

    const { randomUUID } = await import('crypto');
    let imported = 0;

    const importTransaction = db.transaction((samples) => {
      for (const sample of samples) {
        insertSample.run(
          datasetId,
          sample.filename,
          randomUUID(),
          sample.path,
          sample.path
        );
        imported++;
      }
    });

    importTransaction(datasetInfo.samples);

    // Clear cache for this dataset
    sshService.clearCache(dataset.ssh_path);

    res.json({
      success: true,
      message: `Refreshed ${dataset.name}: ${imported} samples`,
      imported
    });
  } catch (error) {
    console.error('SSH refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/admin/ssh/cache/:datasetName?
 * Clear SSH cache for specific dataset or all
 */
app.delete('/api/admin/ssh/cache/:datasetName?', requireAuth, requireAdmin, (req, res) => {
  try {
    const { datasetName } = req.params;

    sshService.clearCache(datasetName || null);

    res.json({
      success: true,
      message: datasetName ? `Cache cleared for ${datasetName}` : 'All cache cleared'
    });
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// DATASET SPLIT MANAGEMENT
// ============================================================================

// Register split routes
registerSplitRoutes(app, db, requireAuth, requireAdmin);

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/api/health', (req, res) => {
  try {
    // Check database connection
    const result = db.prepare('SELECT 1 as ok').get();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: result.ok === 1 ? 'connected' : 'error'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'error'
    });
  }
});

// ============================================================================
// SERVE FRONTEND IN PRODUCTION
// ============================================================================

if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(frontendPath));

  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CMI NeuroQC Offline server running on port ${PORT}`);
  console.log(`📁 Serving images from: ${path.join(__dirname, '..', 'data', 'images')}`);
  console.log(`💾 Database: ${path.join(__dirname, '..', 'data', 'neuroqc.db')}`);
  console.log(`🔒 Authentication: Local (JWT + bcrypt)`);
  console.log(`🌐 Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌍 Accessible at: http://megaswipes:${PORT} or http://localhost:${PORT}`);
});
