#!/usr/bin/env node
/**
 * Migration script to add sample assignment tracking for dataset splits
 * 
 * This script adds a new table to track which samples are assigned to which users
 * for inter-rater reliability studies and workload distribution.
 * 
 * Usage:
 *   node scripts/add-sample-assignments.js
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'data', 'neuroqc.db');
const db = new Database(dbPath);

console.log('\n' + '='.repeat(60));
console.log('📊 Sample Assignment Migration');
console.log('='.repeat(60) + '\n');

try {
  console.log('✅ Connected to database\n');
  
  // Begin transaction
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Create sample_assignments table
    console.log('1️⃣  Creating sample_assignments table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS sample_assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id INTEGER NOT NULL,
        sample_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        assignment_type TEXT NOT NULL, -- 'overlap', 'individual', 'excluded'
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
        FOREIGN KEY (sample_id) REFERENCES samples(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(sample_id, user_id)
      )
    `);
    console.log('   ✅ Table created\n');
    
    // Create dataset_splits table to track split configurations
    console.log('2️⃣  Creating dataset_splits table...');
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
    console.log('   ✅ Table created\n');
    
    // Create split_allocations table to track user allocations
    console.log('3️⃣  Creating split_allocations table...');
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
    console.log('   ✅ Table created\n');
    
    // Create indexes for performance
    console.log('4️⃣  Creating indexes...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sample_assignments_dataset 
        ON sample_assignments(dataset_id);
      CREATE INDEX IF NOT EXISTS idx_sample_assignments_sample 
        ON sample_assignments(sample_id);
      CREATE INDEX IF NOT EXISTS idx_sample_assignments_user 
        ON sample_assignments(user_id);
      CREATE INDEX IF NOT EXISTS idx_dataset_splits_dataset 
        ON dataset_splits(dataset_id);
      CREATE INDEX IF NOT EXISTS idx_split_allocations_split 
        ON split_allocations(split_id);
    `);
    console.log('   ✅ Indexes created\n');
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('='.repeat(60));
    console.log('✅ Migration completed successfully!');
    console.log('='.repeat(60));
    console.log('   Tables created:');
    console.log('   - sample_assignments (tracks which samples assigned to which users)');
    console.log('   - dataset_splits (tracks split configurations)');
    console.log('   - split_allocations (tracks user percentage allocations)');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    throw error;
  }
  
  db.close();
  
} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
