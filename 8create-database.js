#!/usr/bin/env node

/**
 * Standalone Database Initialization Script for CMI NeuroQC
 * 
 * This script creates the SQLite database with all necessary tables,
 * indexes, triggers, and default data.
 * 
 * Usage:
 *   node create-database.js [database-path]
 * 
 * If no path is provided, creates: ./data/neuroqc.db
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

// Get database path from command line or use default
const dbPath = process.argv[2] || './data/neuroqc.db';
const resolvedPath = resolve(dbPath);
const dataDir = dirname(resolvedPath);

console.log('🗄️  CMI NeuroQC Database Initialization\n');
console.log(`📁 Database path: ${resolvedPath}\n`);

// Ensure data directory exists
if (!existsSync(dataDir)) {
  console.log(`📂 Creating directory: ${dataDir}`);
  mkdirSync(dataDir, { recursive: true });
}

// Create/open database
const db = new Database(resolvedPath);

// Enable foreign keys and WAL mode
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

console.log('📋 Creating tables...\n');

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    consent_given INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Studies table
db.exec(`
  CREATE TABLE IF NOT EXISTS studies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Datasets table
db.exec(`
  CREATE TABLE IF NOT EXISTS datasets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image_path TEXT NOT NULL,
    ssh_path TEXT,
    is_ssh INTEGER DEFAULT 0,
    is_public INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (study_id) REFERENCES studies(id) ON DELETE CASCADE
  )
`);

// Samples table
db.exec(`
  CREATE TABLE IF NOT EXISTS samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT,
    ssh_path TEXT,
    secure_token TEXT UNIQUE,
    vote_count INTEGER DEFAULT 0,
    average_rating REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
  )
`);

// Votes table
db.exec(`
  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    sample_id INTEGER NOT NULL,
    filename TEXT,
    vote INTEGER,
    rating INTEGER,
    comment TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE,
    UNIQUE(user_id, sample_id)
  )
`);

// User dataset access table
db.exec(`
  CREATE TABLE IF NOT EXISTS user_dataset_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    dataset_id INTEGER NOT NULL,
    access_granted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
    UNIQUE(user_id, dataset_id)
  )
`);

// Sessions table
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

console.log('📇 Creating indexes...\n');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);
  CREATE INDEX IF NOT EXISTS idx_votes_sample_id ON votes(sample_id);
  CREATE INDEX IF NOT EXISTS idx_samples_dataset_id ON samples(dataset_id);
  CREATE INDEX IF NOT EXISTS idx_datasets_study_id ON datasets(study_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
`);

console.log('⚡ Creating triggers...\n');

db.exec(`
  CREATE TRIGGER IF NOT EXISTS update_sample_stats_after_vote
  AFTER INSERT ON votes
  BEGIN
    UPDATE samples
    SET 
      vote_count = (SELECT COUNT(*) FROM votes WHERE sample_id = NEW.sample_id),
      average_rating = (SELECT AVG(rating) FROM votes WHERE sample_id = NEW.sample_id AND rating IS NOT NULL),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.sample_id;
    
    UPDATE users
    SET 
      total_score = total_score + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.user_id;
  END;
`);

db.exec(`
  CREATE TRIGGER IF NOT EXISTS update_sample_stats_after_vote_update
  AFTER UPDATE ON votes
  BEGIN
    UPDATE samples
    SET 
      vote_count = (SELECT COUNT(*) FROM votes WHERE sample_id = NEW.sample_id),
      average_rating = (SELECT AVG(rating) FROM votes WHERE sample_id = NEW.sample_id AND rating IS NOT NULL),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.sample_id;
  END;
`);

console.log('📦 Inserting default data...\n');

// Create default admin user
const adminPasswordHash = bcrypt.hashSync('admin123', 10);
const adminId = 'admin-' + Date.now();

try {
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, consent_given, is_admin)
    VALUES (?, ?, ?, ?, 1, 1)
  `).run(adminId, 'admin', 'admin@cmi.org', adminPasswordHash);
  
  console.log('✅ Created admin user:');
  console.log('   Email: admin@cmi.org');
  console.log('   Password: admin123');
  console.log('   ⚠️  Change this password after first login!\n');
} catch (err) {
  if (err.message.includes('UNIQUE constraint')) {
    console.log('ℹ️  Admin user already exists\n');
  } else {
    throw err;
  }
}

// Create default study
try {
  const studyResult = db.prepare(`
    INSERT INTO studies (name, description)
    VALUES (?, ?)
  `).run('CMI Brain Scan QC', 'Child Mind Institute neuroimaging quality control study');
  
  const studyId = studyResult.lastInsertRowid;
  console.log(`✅ Created study: CMI Brain Scan QC (ID: ${studyId})\n`);
  
  // Create default dataset
  const datasetResult = db.prepare(`
    INSERT INTO datasets (study_id, name, description, image_path, is_public)
    VALUES (?, ?, ?, ?, 1)
  `).run(studyId, 'T1-weighted Brain Scans', 'T1-weighted structural MRI scans for quality assessment', '1');
  
  const datasetId = datasetResult.lastInsertRowid;
  console.log(`✅ Created dataset: T1-weighted Brain Scans (ID: ${datasetId})\n`);
} catch (err) {
  if (err.message.includes('UNIQUE constraint')) {
    console.log('ℹ️  Default study and dataset already exist\n');
  } else {
    throw err;
  }
}

// Display statistics
const stats = {
  users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
  studies: db.prepare('SELECT COUNT(*) as count FROM studies').get().count,
  datasets: db.prepare('SELECT COUNT(*) as count FROM datasets').get().count,
  samples: db.prepare('SELECT COUNT(*) as count FROM samples').get().count,
  votes: db.prepare('SELECT COUNT(*) as count FROM votes').get().count
};

console.log('📊 Database Statistics:');
console.log(`   Users: ${stats.users}`);
console.log(`   Studies: ${stats.studies}`);
console.log(`   Datasets: ${stats.datasets}`);
console.log(`   Samples: ${stats.samples}`);
console.log(`   Votes: ${stats.votes}\n`);

console.log('✅ Database initialization complete!\n');

db.close();
