#!/usr/bin/env node
/**
 * Migration script to add secure tokens and file paths to samples table
 * 
 * This script will:
 * 1. Add secure_token column to samples table
 * 2. Add file_path column to samples table
 * 3. Generate secure tokens for all existing samples
 * 4. Populate file_path from existing image_path and filename
 * 
 * Usage:
 *   node scripts/add-secure-tokens.js
 */

import { randomUUID } from 'crypto';
import db from '../backend/database.js';

console.log('\n' + '='.repeat(60));
console.log('🔒 Secure Image Serving Migration');
console.log('='.repeat(60) + '\n');

try {
  console.log('✅ Connected to database\n');
  
  // Check if columns already exist
  const tableInfo = db.prepare("PRAGMA table_info(samples)").all();
  const hasSecureToken = tableInfo.some(col => col.name === 'secure_token');
  const hasFilePath = tableInfo.some(col => col.name === 'file_path');
  
  if (hasSecureToken && hasFilePath) {
    console.log('⚠️  Migration already applied. Columns exist.');
    console.log('   If you need to regenerate tokens, use --force flag\n');
    db.close();
    process.exit(0);
  }
  
  console.log('📋 Starting migration...\n');
  
  // Begin transaction
  db.exec('BEGIN TRANSACTION');
  
  try {
    // Step 1: Add secure_token column if it doesn't exist
    if (!hasSecureToken) {
      console.log('1️⃣  Adding secure_token column...');
      db.exec(`
        ALTER TABLE samples 
        ADD COLUMN secure_token TEXT UNIQUE
      `);
      console.log('   ✅ Column added\n');
    }
    
    // Step 2: Add file_path column if it doesn't exist
    if (!hasFilePath) {
      console.log('2️⃣  Adding file_path column...');
      db.exec(`
        ALTER TABLE samples 
        ADD COLUMN file_path TEXT
      `);
      console.log('   ✅ Column added\n');
    }
    
    // Step 3: Get all samples with their dataset image_path
    console.log('3️⃣  Generating secure tokens and file paths...');
    const samples = db.prepare(`
      SELECT s.id, s.filename, d.image_path
      FROM samples s
      JOIN datasets d ON s.dataset_id = d.id
      WHERE s.secure_token IS NULL
    `).all();
    
    console.log(`   Found ${samples.length} samples to update\n`);
    
    // Step 4: Update each sample with secure token and file path
    const updateStmt = db.prepare(`
      UPDATE samples 
      SET secure_token = ?, file_path = ?
      WHERE id = ?
    `);
    
    let updated = 0;
    for (const sample of samples) {
      const secureToken = randomUUID();
      const filePath = `${sample.image_path}/${sample.filename}`;
      
      updateStmt.run(secureToken, filePath, sample.id);
      updated++;
      
      if (updated % 100 === 0) {
        console.log(`   Progress: ${updated}/${samples.length}`);
      }
    }
    
    console.log(`   ✅ Updated ${updated} samples\n`);
    
    // Step 5: Create index on secure_token for fast lookups
    console.log('4️⃣  Creating index on secure_token...');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_samples_secure_token 
      ON samples(secure_token)
    `);
    console.log('   ✅ Index created\n');
    
    // Commit transaction
    db.exec('COMMIT');
    
    console.log('='.repeat(60));
    console.log('✅ Migration completed successfully!');
    console.log('='.repeat(60));
    console.log(`   Samples updated: ${updated}`);
    console.log(`   Secure tokens generated: ${updated}`);
    console.log(`   File paths populated: ${updated}`);
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    // Rollback on error
    db.exec('ROLLBACK');
    throw error;
  }
  
} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
