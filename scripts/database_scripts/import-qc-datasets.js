#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomBytes } from 'crypto';
import db from '../../backend/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const dataDir = path.join(__dirname, '..', 'data');
const qcFolders = ['MH', 'SP', 'BC', 'RG'];
const studyName = 'QC';

console.log('='.repeat(60));
console.log('Importing QC Datasets');
console.log('='.repeat(60));
console.log();

// Get or create QC study
let study = db.prepare('SELECT id, name FROM studies WHERE name = ?').get(studyName);

if (!study) {
  console.log(`Creating study: ${studyName}...`);
  const result = db.prepare(`
    INSERT INTO studies (name, description)
    VALUES (?, ?)
  `).run(studyName, 'Quality Control study for rater assignments');

  study = { id: result.lastInsertRowid, name: studyName };
  console.log(`✓ Created study: ${study.name} (ID: ${study.id})\n`);
} else {
  console.log(`✓ Using existing study: ${study.name} (ID: ${study.id})\n`);
}

const studyId = study.id;

// Prepare SQL statements
const getDatasetStmt = db.prepare(`
  SELECT id, name, image_path FROM datasets 
  WHERE study_id = ? AND name = ?
`);
const insertDatasetStmt = db.prepare(`
  INSERT INTO datasets (study_id, name, description, image_path, is_ssh, ssh_path, is_public)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const updateDatasetStmt = db.prepare(`
  UPDATE datasets 
  SET study_id = ?, is_public = ?
  WHERE id = ?
`);
const insertSampleStmt = db.prepare(`
  INSERT OR IGNORE INTO samples (dataset_id, filename, secure_token, file_path, ssh_path)
  VALUES (?, ?, ?, ?, ?)
`);
const deleteSamplesStmt = db.prepare('DELETE FROM samples WHERE dataset_id = ?');

// Helper function to generate secure token
function generateSecureToken() {
  return randomBytes(32).toString('hex');
}

// Helper function to recursively find PNG files
function findPNGFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) {
    return files;
  }

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);

    if (stat.isDirectory()) {
      files.push(...findPNGFiles(itemPath));
    } else if (item.toLowerCase().endsWith('.png')) {
      files.push(itemPath);
    }
  }

  return files;
}

let totalDatasets = 0;
let totalSamples = 0;
let datasetsCreated = 0;
let datasetsUpdated = 0;

// Process each QC folder
for (const folderName of qcFolders) {
  console.log(`\nProcessing folder: ${folderName}`);
  console.log('-'.repeat(60));

  const folderPath = path.join(dataDir, folderName);

  if (!fs.existsSync(folderPath)) {
    console.log(`⚠️  Folder does not exist: ${folderPath}`);
    continue;
  }

  // Find all PNG files in the folder
  const pngFiles = findPNGFiles(folderPath);
  console.log(`  Found ${pngFiles.length} PNG files`);

  if (pngFiles.length === 0) {
    console.log(`  ⚠️  No PNG files found, skipping...`);
    continue;
  }

  // Check if dataset already exists
  let dataset = getDatasetStmt.get(studyId, folderName);

  if (!dataset) {
    // Create new dataset (private)
    const description = `QC dataset for ${folderName} rater with ${pngFiles.length} images`;
    const imagePath = folderName; // Relative path from data directory

    const result = insertDatasetStmt.run(
      studyId,
      folderName,
      description,
      imagePath,
      0, // is_ssh
      null, // ssh_path
      0 // is_public (private)
    );

    dataset = {
      id: result.lastInsertRowid,
      name: folderName,
      image_path: imagePath
    };

    console.log(`  ✓ Created dataset: ${dataset.name} (ID: ${dataset.id})`);
    datasetsCreated++;
  } else {
    // Update existing dataset to be in QC study and private
    updateDatasetStmt.run(studyId, 0, dataset.id);
    console.log(`  ✓ Using existing dataset: ${dataset.name} (ID: ${dataset.id})`);
    console.log(`  ✓ Updated to QC study and set as private`);
    datasetsUpdated++;

    // Clear existing samples to re-import
    deleteSamplesStmt.run(dataset.id);
    console.log(`  ✓ Cleared existing samples for re-import`);
  }

  // Import all PNG files as samples
  let imported = 0;
  let skipped = 0;

  for (const pngPath of pngFiles) {
    const filename = path.basename(pngPath);
    const relativePath = path.relative(dataDir, pngPath);
    const secureToken = generateSecureToken();

    try {
      insertSampleStmt.run(
        dataset.id,
        filename,
        secureToken,
        relativePath,
        null // ssh_path
      );
      imported++;
    } catch (error) {
      if (error.message.includes('UNIQUE constraint')) {
        skipped++;
      } else {
        console.error(`  ✗ Error importing ${filename}:`, error.message);
      }
    }
  }

  console.log(`  ✓ Imported ${imported} samples`);
  if (skipped > 0) {
    console.log(`  ⚠️  Skipped ${skipped} duplicate samples`);
  }

  totalDatasets++;
  totalSamples += imported;
}

console.log('\n' + '='.repeat(60));
console.log('Import Summary');
console.log('='.repeat(60));
console.log(`Study: ${studyName} (ID: ${studyId})`);
console.log(`Datasets created: ${datasetsCreated}`);
console.log(`Datasets updated: ${datasetsUpdated}`);
console.log(`Total datasets: ${totalDatasets}`);
console.log(`Total samples imported: ${totalSamples}`);
console.log('='.repeat(60));
console.log('\n✓ All QC datasets are now private.');
console.log('  You can assign users to these datasets using the admin interface.');
console.log();

