#!/usr/bin/env node
/**
 * Reset Database Script
 * 
 * This script will:
 * 1. Backup the existing database (if it exists)
 * 2. Delete the old database
 * 3. Create a fresh database with all tables
 * 4. Create admin user
 * 5. Optionally import images
 * 
 * Usage:
 *   node scripts/reset-database.js [--no-backup] [--keep-admin]
 * 
 * Options:
 *   --no-backup    Skip database backup
 *   --keep-admin   Keep existing admin credentials (if backup exists)
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '..');
const dataDir = join(projectRoot, 'data');
const dbPath = join(dataDir, 'neuroqc.db');
const backupDir = join(dataDir, 'backups');

// Parse command line arguments
const args = process.argv.slice(2);
const noBackup = args.includes('--no-backup');
const keepAdmin = args.includes('--keep-admin');

console.log('\n' + '='.repeat(60));
console.log('🔄 Database Reset Script');
console.log('='.repeat(60) + '\n');

// Warning
console.log('⚠️  WARNING: This will delete all existing data!');
console.log('   - All users (except admin if --keep-admin)');
console.log('   - All studies and datasets');
console.log('   - All samples and votes');
console.log('   - All dataset splits and assignments');
console.log('');

if (!noBackup) {
  console.log('✅ Database will be backed up first\n');
} else {
  console.log('⚠️  --no-backup flag set: Database will NOT be backed up\n');
}

// Confirm
const readline = await import('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const answer = await new Promise(resolve => {
  rl.question('Type "RESET" to continue: ', resolve);
});
rl.close();

if (answer !== 'RESET') {
  console.log('\n❌ Reset cancelled\n');
  process.exit(0);
}

console.log('');

try {
  // Step 1: Backup existing database
  if (!noBackup && fs.existsSync(dbPath)) {
    console.log('📦 Backing up existing database...');
    
    // Create backup directory
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Create backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupPath = join(backupDir, `neuroqc_backup_${timestamp}.db`);
    
    // Copy database
    fs.copyFileSync(dbPath, backupPath);
    console.log(`   ✅ Backup saved to: ${backupPath}\n`);
    
    // Extract admin credentials if --keep-admin
    if (keepAdmin) {
      const oldDb = new Database(backupPath, { readonly: true });
      const admin = oldDb.prepare('SELECT * FROM users WHERE is_admin = 1 LIMIT 1').get();
      oldDb.close();
      
      if (admin) {
        console.log('   ℹ️  Admin credentials will be preserved\n');
        var adminData = admin;
      }
    }
  }
  
  // Step 2: Delete old database
  if (fs.existsSync(dbPath)) {
    console.log('🗑️  Deleting old database...');
    fs.unlinkSync(dbPath);
    console.log('   ✅ Old database deleted\n');
  }
  
  // Step 3: Create fresh database
  console.log('🆕 Creating fresh database...\n');
  
  const db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Create tables
  console.log('📋 Creating tables...');
  
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
  
  // Sample assignments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sample_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      sample_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      assignment_type TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
      FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(sample_id, user_id)
    )
  `);
  
  // Dataset splits table
  db.exec(`
    CREATE TABLE IF NOT EXISTS dataset_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dataset_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      overlap_percentage REAL NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);
  
  // Split allocations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS split_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      split_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      percentage REAL NOT NULL,
      sample_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (split_id) REFERENCES dataset_splits(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(split_id, user_id)
    )
  `);
  
  console.log('   ✅ Tables created\n');
  
  // Create indexes
  console.log('📇 Creating indexes...');
  
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes(user_id);
    CREATE INDEX IF NOT EXISTS idx_votes_sample_id ON votes(sample_id);
    CREATE INDEX IF NOT EXISTS idx_samples_dataset_id ON samples(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_datasets_study_id ON datasets(study_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sample_assignments_dataset ON sample_assignments(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_sample_assignments_sample ON sample_assignments(sample_id);
    CREATE INDEX IF NOT EXISTS idx_sample_assignments_user ON sample_assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_dataset_splits_dataset ON dataset_splits(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_split_allocations_split ON split_allocations(split_id);
    CREATE INDEX IF NOT EXISTS idx_samples_secure_token ON samples(secure_token);
  `);
  
  console.log('   ✅ Indexes created\n');
  
  // Create triggers
  console.log('⚡ Creating triggers...');
  
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
  
  console.log('   ✅ Triggers created\n');
  
  // Step 4: Create admin user
  console.log('👤 Creating admin user...');
  
  if (keepAdmin && adminData) {
    // Restore admin from backup
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, consent_given, is_admin, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      adminData.id,
      adminData.username,
      adminData.email,
      adminData.password_hash,
      adminData.consent_given,
      adminData.is_admin,
      adminData.created_at,
      adminData.updated_at
    );
    console.log(`   ✅ Admin user restored: ${adminData.email}\n`);
  } else {
    // Create new admin
    const adminPasswordHash = bcrypt.hashSync('admin123', 10);
    const adminId = 'admin-' + Date.now();
    
    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, consent_given, is_admin)
      VALUES (?, ?, ?, ?, 1, 1)
    `).run(adminId, 'admin', 'admin@example.com', adminPasswordHash);
    
    console.log('   ✅ Admin user created:');
    console.log('      Email: admin@example.com');
    console.log('      Password: admin123');
    console.log('      ⚠️  CHANGE THIS PASSWORD IMMEDIATELY!\n');
  }
  
  db.close();
  
  console.log('='.repeat(60));
  console.log('✅ Database reset complete!');
  console.log('='.repeat(60));
  console.log('\n📋 Next Steps:\n');
  console.log('1. Import your images:');
  console.log('   node scripts/import-images.js\n');
  console.log('2. Or import SSH datasets:');
  console.log('   node scripts/import-ssh-datasets.js\n');
  console.log('3. Create user accounts for your 4 raters via Admin Dashboard\n');
  console.log('4. Create dataset split (15% overlap, 70/70/30/30 distribution)\n');
  console.log('5. Start the server:');
  console.log('   npm run dev\n');
  
  if (!noBackup && fs.existsSync(backupDir)) {
    console.log(`💾 Backup location: ${backupDir}\n`);
  }
  
} catch (error) {
  console.error('\n❌ Reset failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
