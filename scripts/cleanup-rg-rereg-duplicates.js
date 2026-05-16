#!/usr/bin/env node

/**
 * Cleanup RG_rereg Duplicate Samples
 * 
 * This script removes duplicate samples from the RG_rereg dataset.
 * It keeps the original samples with votes and removes the newly created duplicates.
 */

import db from '../backend/database.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const datasetName = 'RG_rereg';
const studyName = 'QC';

console.log('='.repeat(60));
console.log('Cleaning up RG_rereg Duplicate Samples');
console.log('='.repeat(60));
console.log();

// Get QC study
const study = db.prepare('SELECT id, name FROM studies WHERE name = ?').get(studyName);

if (!study) {
    console.error(`❌ Study '${studyName}' not found in database`);
    process.exit(1);
}

// Get dataset
const dataset = db.prepare(`
  SELECT id, name FROM datasets 
  WHERE study_id = ? AND name = ?
`).get(study.id, datasetName);

if (!dataset) {
    console.error(`❌ Dataset '${datasetName}' not found in database`);
    process.exit(1);
}

console.log(`✓ Found dataset: ${dataset.name} (ID: ${dataset.id})\n`);

// Find all duplicates in this dataset grouped by filename
const duplicates = db.prepare(`
  SELECT 
    filename,
    COUNT(*) as count,
    GROUP_CONCAT(id) as sample_ids
  FROM samples
  WHERE dataset_id = ?
  GROUP BY filename
  HAVING COUNT(*) > 1
  ORDER BY filename
`).all(dataset.id);

if (duplicates.length === 0) {
    console.log('✅ No duplicates found in this dataset!\n');
    
    // Show current sample count
    const totalSamples = db.prepare('SELECT COUNT(*) as count FROM samples WHERE dataset_id = ?').get(dataset.id);
    const samplesWithVotes = db.prepare(`
      SELECT COUNT(DISTINCT s.id) as count 
      FROM samples s
      INNER JOIN votes v ON s.id = v.sample_id
      WHERE s.dataset_id = ?
    `).get(dataset.id);
    
    console.log(`📊 Current dataset statistics:`);
    console.log(`   Total samples: ${totalSamples.count}`);
    console.log(`   Samples with votes: ${samplesWithVotes.count}`);
    console.log(`   Samples without votes: ${totalSamples.count - samplesWithVotes.count}\n`);
    
    process.exit(0);
}

console.log(`Found ${duplicates.length} sets of duplicates\n`);

// Prepare statements
const getSampleDetails = db.prepare(`
  SELECT id, vote_count, created_at, secure_token, filename
  FROM samples
  WHERE id = ?
`);

const deleteSample = db.prepare('DELETE FROM samples WHERE id = ?');

const getVotesForSample = db.prepare('SELECT COUNT(*) as count FROM votes WHERE sample_id = ?');

let totalRemoved = 0;
let totalKept = 0;

// Process each set of duplicates
const processDuplicates = db.transaction((duplicateSets) => {
    for (const dup of duplicateSets) {
        const sampleIds = dup.sample_ids.split(',').map(id => parseInt(id));
        
        // Get details for each duplicate
        const samples = sampleIds.map(id => {
            const sample = getSampleDetails.get(id);
            const votes = getVotesForSample.get(id);
            return {
                id: sample.id,
                filename: sample.filename,
                vote_count: sample.vote_count || 0,
                actual_vote_count: votes.count,
                created_at: sample.created_at,
                secure_token: sample.secure_token
            };
        });
        
        // Sort to determine which to keep:
        // 1. Most votes (actual_vote_count from votes table) - this will keep the original 600
        // 2. If tied (both have 0 votes), keep the oldest created_at
        samples.sort((a, b) => {
            if (b.actual_vote_count !== a.actual_vote_count) {
                return b.actual_vote_count - a.actual_vote_count;
            }
            return new Date(a.created_at) - new Date(b.created_at);
        });
        
        const keepSample = samples[0];
        const removeSamples = samples.slice(1);
        
        console.log(`📄 Filename: ${dup.filename}`);
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

console.log('='.repeat(60));
console.log('Cleanup Summary');
console.log('='.repeat(60));
console.log(`Dataset: ${datasetName} (ID: ${dataset.id})`);
console.log(`✅ Kept: ${totalKept} unique samples (with votes preserved)`);
console.log(`❌ Removed: ${totalRemoved} duplicate samples\n`);

// Show final statistics
const totalSamples = db.prepare('SELECT COUNT(*) as count FROM samples WHERE dataset_id = ?').get(dataset.id);
const samplesWithVotes = db.prepare(`
  SELECT COUNT(DISTINCT s.id) as count 
  FROM samples s
  INNER JOIN votes v ON s.id = v.sample_id
  WHERE s.dataset_id = ?
`).get(dataset.id);

console.log(`📊 Final dataset statistics:`);
console.log(`   Total samples: ${totalSamples.count}`);
console.log(`   Samples with votes: ${samplesWithVotes.count}`);
console.log(`   Samples without votes: ${totalSamples.count - samplesWithVotes.count}`);
console.log('='.repeat(60));
console.log('\n✅ Cleanup complete!');
console.log('   Original samples with votes have been preserved.');
console.log('   Duplicate samples without votes have been removed.\n');

