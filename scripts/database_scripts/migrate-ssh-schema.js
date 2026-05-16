#!/usr/bin/env node
/**
 * Migration script to add SSH-related columns to existing database
 * 
 * This script adds:
 * - datasets.ssh_path
 * - datasets.is_ssh
 * - samples.file_path
 * - samples.ssh_path
 * - samples.secure_token
 * 
 * Usage:
 *   node scripts/migrate-ssh-schema.js
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = path.join(__dirname, '..', 'data', 'neuroqc.db');

console.log('\n' + '='.repeat(60));
console.log('🔄 CMI NeuroQC - SSH Schema Migration');
console.log('='.repeat(60) + '\n');

console.log(`📁 Database: ${dbPath}\n`);

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

try {
  console.log('🔍 Checking current schema...\n');

  // Check if columns already exist
  const datasetsInfo = db.pragma('table_info(datasets)');
  const samplesInfo = db.pragma('table_info(samples)');

  const hasDatasetsSshPath = datasetsInfo.some(col => col.name === 'ssh_path');
  const hasDatasetsIsSsh = datasetsInfo.some(col => col.name === 'is_ssh');
  const hasSamplesFilePath = samplesInfo.some(col => col.name === 'file_path');
  const hasSamplesSshPath = samplesInfo.some(col => col.name === 'ssh_path');
  const hasSamplesSecureToken = samplesInfo.some(col => col.name === 'secure_token');

  console.log('Current schema status:');
  console.log(`  datasets.ssh_path: ${hasDatasetsSshPath ? '✅ exists' : '❌ missing'}`);
  console.log(`  datasets.is_ssh: ${hasDatasetsIsSsh ? '✅ exists' : '❌ missing'}`);
  console.log(`  samples.file_path: ${hasSamplesFilePath ? '✅ exists' : '❌ missing'}`);
  console.log(`  samples.ssh_path: ${hasSamplesSshPath ? '✅ exists' : '❌ missing'}`);
  console.log(`  samples.secure_token: ${hasSamplesSecureToken ? '✅ exists' : '❌ missing'}`);
  console.log();

  let changesMade = false;

  // Add datasets columns
  if (!hasDatasetsSshPath) {
    console.log('➕ Adding datasets.ssh_path...');
    db.exec('ALTER TABLE datasets ADD COLUMN ssh_path TEXT');
    changesMade = true;
  }

  if (!hasDatasetsIsSsh) {
    console.log('➕ Adding datasets.is_ssh...');
    db.exec('ALTER TABLE datasets ADD COLUMN is_ssh INTEGER DEFAULT 0');
    changesMade = true;
  }

  // Add samples columns
  if (!hasSamplesFilePath) {
    console.log('➕ Adding samples.file_path...');
    db.exec('ALTER TABLE samples ADD COLUMN file_path TEXT');
    changesMade = true;
  }

  if (!hasSamplesSshPath) {
    console.log('➕ Adding samples.ssh_path...');
    db.exec('ALTER TABLE samples ADD COLUMN ssh_path TEXT');
    changesMade = true;
  }

  if (!hasSamplesSecureToken) {
    console.log('➕ Adding samples.secure_token...');
    db.exec('ALTER TABLE samples ADD COLUMN secure_token TEXT UNIQUE');
    changesMade = true;
  }

  if (changesMade) {
    console.log('\n🔄 Migrating existing data...\n');

    // Update existing samples with secure tokens and file paths
    const samples = db.prepare('SELECT id, dataset_id, filename FROM samples WHERE secure_token IS NULL').all();
    
    if (samples.length > 0) {
      console.log(`📝 Generating secure tokens for ${samples.length} existing samples...`);
      
      const updateStmt = db.prepare(`
        UPDATE samples 
        SET secure_token = ?, file_path = ?
        WHERE id = ?
      `);

      const updateTransaction = db.transaction((samples) => {
        for (const sample of samples) {
          const secureToken = randomUUID();
          // Get dataset info to construct file path
          const dataset = db.prepare('SELECT image_path FROM datasets WHERE id = ?').get(sample.dataset_id);
          const filePath = dataset ? `${dataset.image_path}/${sample.filename}` : sample.filename;
          
          updateStmt.run(secureToken, filePath, sample.id);
        }
      });

      updateTransaction(samples);
      console.log(`   ✅ Updated ${samples.length} samples`);
    }

    console.log('\n✅ Migration complete!\n');
  } else {
    console.log('\n✅ Schema is already up to date. No migration needed.\n');
  }

  // Display final schema
  console.log('📊 Final schema:');
  console.log('\nDatasets table:');
  db.pragma('table_info(datasets)').forEach(col => {
    if (['ssh_path', 'is_ssh'].includes(col.name)) {
      console.log(`  ✨ ${col.name} (${col.type})`);
    }
  });

  console.log('\nSamples table:');
  db.pragma('table_info(samples)').forEach(col => {
    if (['file_path', 'ssh_path', 'secure_token'].includes(col.name)) {
      console.log(`  ✨ ${col.name} (${col.type})`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ Migration successful!');
  console.log('='.repeat(60) + '\n');

  console.log('Next steps:');
  console.log('  1. Configure SSH in .env file');
  console.log('  2. Test SSH connection');
  console.log('  3. Import SSH datasets: node scripts/import-ssh-datasets.js\n');

} catch (error) {
  console.error('\n❌ Migration failed:', error.message);
  console.error(error.stack);
  process.exit(1);
} finally {
  db.close();
}
