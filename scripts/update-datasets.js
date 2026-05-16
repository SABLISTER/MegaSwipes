#!/usr/bin/env node
/**
 * Update Datasets Script
 * 
 * This script updates datasets MH, RG, SP, and BC by adding new images
 * from their respective folders in /home/mhouse/MegaSwipes/data.
 * 
 * IMPORTANT: This script does NOT:
 * - Erase any existing database entries
 * - Modify any existing samples
 * - Delete any data
 * 
 * It ONLY adds new images that are not yet in the database.
 * 
 * Usage:
 *   node scripts/update-datasets.js
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Database path
const dbPath = join(projectRoot, 'data', 'neuroqc.db');
const dataDir = join(projectRoot, 'data');

if (!existsSync(dbPath)) {
  console.error(`❌ Database not found at: ${dbPath}`);
  process.exit(1);
}

if (!existsSync(dataDir)) {
  console.error(`❌ Data directory not found at: ${dataDir}`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

console.log('='.repeat(60));
console.log('📥 Updating Datasets: MH, RG, SP, BC');
console.log('='.repeat(60));
console.log();
console.log(`Database: ${dbPath}`);
console.log(`Data directory: ${dataDir}`);
console.log();

// Datasets to update
const datasetsToUpdate = ['MH', 'RG', 'SP', 'BC'];

// Get dataset IDs by name (regardless of study)
const getDatasetStmt = db.prepare('SELECT id, name, study_id FROM datasets WHERE name = ?');
const datasetInfo = {};

console.log('🔍 Finding datasets in database...\n');

for (const datasetName of datasetsToUpdate) {
  const dataset = getDatasetStmt.get(datasetName);
  if (!dataset) {
    console.warn(`⚠️  Dataset '${datasetName}' not found in database - skipping`);
    continue;
  }
  datasetInfo[datasetName] = {
    id: dataset.id,
    name: dataset.name,
    study_id: dataset.study_id
  };
  console.log(`  ✅ Found ${datasetName} -> Dataset ID: ${dataset.id}`);
}

if (Object.keys(datasetInfo).length === 0) {
  console.error('\n❌ No datasets found. Exiting.');
  db.close();
  process.exit(1);
}

console.log();

// Get existing samples for these datasets (by filename, case-insensitive)
// We'll track by dataset_id and filename_lower to avoid duplicates
const existingSamples = db.prepare(`
  SELECT dataset_id, LOWER(filename) as filename_lower
  FROM samples
  WHERE dataset_id IN (${Object.values(datasetInfo).map(d => d.id).join(',')})
`).all();

// Create a map: dataset_id -> Set of lowercase filenames
const existingFilenamesByDataset = {};
for (const dataset of Object.values(datasetInfo)) {
  existingFilenamesByDataset[dataset.id] = new Set();
}

for (const sample of existingSamples) {
  existingFilenamesByDataset[sample.dataset_id].add(sample.filename_lower);
}

// Count existing samples per dataset
for (const [name, info] of Object.entries(datasetInfo)) {
  const count = existingFilenamesByDataset[info.id].size;
  console.log(`  ${name}: ${count} existing samples`);
}

console.log();

// Prepare insert statement (using INSERT OR IGNORE to be safe)
const insertSampleStmt = db.prepare(`
  INSERT OR IGNORE INTO samples (dataset_id, filename, secure_token, file_path, created_at, updated_at)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

// Image file extensions to look for
const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

let totalImported = 0;
let totalSkipped = 0;

// Process each dataset
const importTransaction = db.transaction(() => {
  for (const datasetName of datasetsToUpdate) {
    if (!datasetInfo[datasetName]) {
      continue; // Skip if dataset not found
    }

    const folderPath = join(dataDir, datasetName);
    const datasetId = datasetInfo[datasetName].id;
    const existingFilenames = existingFilenamesByDataset[datasetId];

    if (!existsSync(folderPath)) {
      console.warn(`⚠️  Folder ${folderPath} does not exist - skipping`);
      continue;
    }

    console.log(`📁 Processing ${datasetName}...`);

    let folderImported = 0;
    let folderSkipped = 0;

    try {
      // Read all files in the folder
      const allFiles = readdirSync(folderPath);
      
      // Filter to only image files
      const imageFiles = allFiles.filter(file => {
        const filePath = join(folderPath, file);
        if (!statSync(filePath).isFile()) {
          return false;
        }
        const ext = file.toLowerCase().substring(file.lastIndexOf('.'));
        return imageExtensions.includes(ext);
      });

      console.log(`  Found ${imageFiles.length} image files in folder`);

      for (const filename of imageFiles) {
        const filenameLower = filename.toLowerCase();

        // Check if this file already exists in the database for this dataset
        if (existingFilenames.has(filenameLower)) {
          folderSkipped++;
          continue;
        }

        // Import this new file
        const secureToken = randomUUID();
        const filePath = `${datasetName}/${filename}`;

        try {
          insertSampleStmt.run(datasetId, filename, secureToken, filePath);
          existingFilenames.add(filenameLower); // Add to set to avoid duplicates in same run
          folderImported++;
          totalImported++;
        } catch (error) {
          if (error.message.includes('UNIQUE constraint')) {
            // This shouldn't happen due to our check, but handle it gracefully
            folderSkipped++;
          } else {
            console.error(`  ❌ Error importing ${filename}:`, error.message);
          }
        }
      }

      console.log(`  ✅ ${datasetName}: Imported ${folderImported} new images, Skipped ${folderSkipped} (already in database)`);
      totalSkipped += folderSkipped;
    } catch (error) {
      console.error(`  ❌ Error reading folder ${datasetName}:`, error.message);
    }
  }
});

// Execute the transaction
importTransaction();

console.log();
console.log('='.repeat(60));
console.log('📊 Summary:');
console.log('='.repeat(60));
console.log(`  ✅ Total new images imported: ${totalImported}`);
console.log(`  ⏭️  Total skipped (already in database): ${totalSkipped}`);
console.log('='.repeat(60));
console.log();

// Verify final counts
console.log('🔍 Verifying final counts...\n');

for (const datasetName of datasetsToUpdate) {
  if (!datasetInfo[datasetName]) {
    continue;
  }

  const folderPath = join(dataDir, datasetName);
  const datasetId = datasetInfo[datasetName].id;

  if (!existsSync(folderPath)) continue;

  const filesInFolder = readdirSync(folderPath)
    .filter(file => {
      const filePath = join(folderPath, file);
      if (!statSync(filePath).isFile()) return false;
      const ext = file.toLowerCase().substring(file.lastIndexOf('.'));
      return imageExtensions.includes(ext);
    }).length;

  const samplesInDataset = db.prepare(`
    SELECT COUNT(*) as count
    FROM samples
    WHERE dataset_id = ?
  `).get(datasetId).count;

  console.log(`  ${datasetName}:`);
  console.log(`    Files in folder: ${filesInFolder}`);
  console.log(`    Samples in database: ${samplesInDataset}`);

  if (filesInFolder === samplesInDataset) {
    console.log(`    ✅ Perfect match!`);
  } else {
    const diff = filesInFolder - samplesInDataset;
    if (diff > 0) {
      console.warn(`    ⚠️  ${diff} files not yet in database (may need to run script again or check for errors)`);
    } else {
      console.warn(`    ⚠️  ${Math.abs(diff)} extra samples in database (may be from other sources)`);
    }
  }
}

console.log();
console.log('='.repeat(60));
console.log('✅ Update complete!');
console.log('='.repeat(60));
console.log();
console.log('Note: Existing database entries were NOT modified or deleted.');
console.log('Only new images were added to the datasets.');
console.log();

db.close();

