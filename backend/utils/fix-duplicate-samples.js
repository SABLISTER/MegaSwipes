/**
 * Fix Duplicate Samples
 * 
 * This script removes duplicate samples from the database and adds
 * a unique constraint to prevent future duplicates.
 * 
 * For duplicates, it keeps the sample with:
 * 1. Most votes (if tied, oldest created_at)
 * 2. If no votes, keeps the oldest sample
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Database path
const dbPath = join(projectRoot, 'data', 'neuroqc.db');

if (!existsSync(dbPath)) {
  console.error(`❌ Database not found at: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

console.log('🔍 Finding duplicate samples...\n');

// Find all duplicates grouped by dataset_id and filename
const duplicates = db.prepare(`
  SELECT 
    dataset_id,
    filename,
    COUNT(*) as count,
    GROUP_CONCAT(id) as sample_ids
  FROM samples
  GROUP BY dataset_id, filename
  HAVING COUNT(*) > 1
  ORDER BY dataset_id, filename
`).all();

if (duplicates.length === 0) {
  console.log('✅ No duplicates found!\n');
  
  // Still add the unique constraint if it doesn't exist
  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_samples_dataset_filename 
      ON samples(dataset_id, filename)
    `);
    console.log('✅ Unique constraint added to prevent future duplicates\n');
  } catch (error) {
    console.error('⚠️  Could not add unique constraint:', error.message);
  }
  
  db.close();
  process.exit(0);
}

console.log(`Found ${duplicates.length} sets of duplicates\n`);

let totalRemoved = 0;
let totalKept = 0;

// Process each set of duplicates
const getSampleDetails = db.prepare(`
  SELECT id, vote_count, created_at, secure_token
  FROM samples
  WHERE id = ?
`);

const deleteSample = db.prepare('DELETE FROM samples WHERE id = ?');
const getVotesForSample = db.prepare('SELECT COUNT(*) as count FROM votes WHERE sample_id = ?');

const processDuplicates = db.transaction((duplicateSets) => {
  for (const dup of duplicateSets) {
    const sampleIds = dup.sample_ids.split(',').map(id => parseInt(id));
    
    // Get details for each duplicate
    const samples = sampleIds.map(id => {
      const sample = getSampleDetails.get(id);
      const votes = getVotesForSample.get(id);
      return {
        id: sample.id,
        vote_count: sample.vote_count || 0,
        actual_vote_count: votes.count,
        created_at: sample.created_at,
        secure_token: sample.secure_token
      };
    });
    
    // Sort to determine which to keep:
    // 1. Most votes (actual_vote_count from votes table)
    // 2. If tied, oldest created_at
    samples.sort((a, b) => {
      if (b.actual_vote_count !== a.actual_vote_count) {
        return b.actual_vote_count - a.actual_vote_count;
      }
      return new Date(a.created_at) - new Date(b.created_at);
    });
    
    const keepSample = samples[0];
    const removeSamples = samples.slice(1);
    
    console.log(`📁 Dataset ${dup.dataset_id}, Filename: ${dup.filename}`);
    console.log(`   ✅ Keeping sample ID ${keepSample.id} (${keepSample.actual_vote_count} votes, created ${keepSample.created_at})`);
    
    // Delete duplicates
    for (const removeSample of removeSamples) {
      console.log(`   ❌ Removing sample ID ${removeSample.id} (${removeSample.actual_vote_count} votes, created ${removeSample.created_at})`);
      deleteSample.run(removeSample.id);
      totalRemoved++;
    }
    
    totalKept++;
    console.log('');
  }
});

processDuplicates(duplicates);

console.log(`\n📊 Summary:`);
console.log(`   ✅ Kept: ${totalKept} unique samples`);
console.log(`   ❌ Removed: ${totalRemoved} duplicate samples\n`);

// Add unique constraint to prevent future duplicates
console.log('🔒 Adding unique constraint to prevent future duplicates...');
try {
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_samples_dataset_filename 
    ON samples(dataset_id, filename)
  `);
  console.log('✅ Unique constraint added successfully\n');
} catch (error) {
  console.error('❌ Error adding unique constraint:', error.message);
  console.error('   This might fail if duplicates still exist. Please check the database.\n');
}

db.close();
console.log('✅ Done!\n');

