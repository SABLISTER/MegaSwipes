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
const folderName = 'BC_2';
const datasetName = 'BC_2';
const studyName = 'QC';
const userEmail = 'bosi@cmi.org';

console.log('='.repeat(60));
console.log('Importing BC_2 Dataset');
console.log('='.repeat(60));
console.log();

// Get QC study
let study = db.prepare('SELECT id, name FROM studies WHERE name = ?').get(studyName);

if (!study) {
  console.error(`❌ Study '${studyName}' not found in database`);
  console.error('   Please run import-qc-datasets.js first to create the QC study.');
  process.exit(1);
}

console.log(`✓ Using study: ${study.name} (ID: ${study.id})\n`);

const studyId = study.id;

// Get user by email
const getUserStmt = db.prepare('SELECT id, username, email FROM users WHERE email = ?');
const user = getUserStmt.get(userEmail);

if (!user) {
  console.error(`❌ User with email '${userEmail}' not found in database`);
  process.exit(1);
}

console.log(`✓ Found user: ${user.username} (ID: ${user.id}, Email: ${user.email})\n`);

// Check if dataset already exists
const getDatasetStmt = db.prepare(`
  SELECT id, name, image_path FROM datasets 
  WHERE study_id = ? AND name = ?
`);

let dataset = getDatasetStmt.get(studyId, datasetName);

if (dataset) {
  console.log(`⚠️  Dataset '${datasetName}' already exists (ID: ${dataset.id})`);
  console.log('   Skipping dataset creation. Only importing new samples...\n');
} else {
  // Create new dataset
  const insertDatasetStmt = db.prepare(`
    INSERT INTO datasets (study_id, name, description, image_path, is_ssh, ssh_path, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const folderPath = path.join(dataDir, folderName);

  if (!fs.existsSync(folderPath)) {
    console.error(`❌ Folder does not exist: ${folderPath}`);
    process.exit(1);
  }

  // Count PNG files for description
  const pngFiles = findPNGFiles(folderPath);
  const description = `QC dataset for BC rater (BC_2) with ${pngFiles.length} images`;
  const imagePath = folderName; // Relative path from data directory

  const result = insertDatasetStmt.run(
    studyId,
    datasetName,
    description,
    imagePath,
    0, // is_ssh
    null, // ssh_path
    0 // is_public (private)
  );

  dataset = {
    id: result.lastInsertRowid,
    name: datasetName,
    image_path: imagePath
  };

  console.log(`✓ Created dataset: ${dataset.name} (ID: ${dataset.id})`);
  console.log(`  Description: ${description}\n`);
}

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

// Import all PNG files as samples
const folderPath = path.join(dataDir, folderName);

if (!fs.existsSync(folderPath)) {
  console.error(`❌ Folder does not exist: ${folderPath}`);
  process.exit(1);
}

const pngFiles = findPNGFiles(folderPath);
console.log(`Found ${pngFiles.length} PNG files in ${folderName}\n`);

if (pngFiles.length === 0) {
  console.log(`⚠️  No PNG files found, exiting...`);
  process.exit(0);
}

const insertSampleStmt = db.prepare(`
  INSERT OR IGNORE INTO samples (dataset_id, filename, secure_token, file_path, ssh_path)
  VALUES (?, ?, ?, ?, ?)
`);

let imported = 0;
let skipped = 0;

console.log('Importing samples...');
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

console.log(`✓ Imported ${imported} samples`);
if (skipped > 0) {
  console.log(`  ⚠️  Skipped ${skipped} duplicate samples`);
}
console.log();

// Grant dataset access to user BC
console.log('Granting dataset access to user BC...');
const insertAccessStmt = db.prepare(`
  INSERT OR IGNORE INTO user_dataset_access (user_id, dataset_id)
  VALUES (?, ?)
`);

try {
  insertAccessStmt.run(user.id, dataset.id);
  console.log(`✓ Granted access to ${user.username} for dataset ${datasetName}\n`);
} catch (error) {
  if (error.message.includes('UNIQUE constraint')) {
    console.log(`ℹ️  User ${user.username} already has access to this dataset\n`);
  } else {
    console.error(`✗ Error granting access:`, error.message);
    process.exit(1);
  }
}

console.log('='.repeat(60));
console.log('Import Summary');
console.log('='.repeat(60));
console.log(`Study: ${studyName} (ID: ${studyId})`);
console.log(`Dataset: ${datasetName} (ID: ${dataset.id})`);
console.log(`Total samples imported: ${imported}`);
if (skipped > 0) {
  console.log(`Samples skipped (already exist): ${skipped}`);
}
console.log(`User assigned: ${user.username} (ID: ${user.id})`);
console.log('='.repeat(60));
console.log('\n✓ BC_2 dataset import complete.');
console.log('  Dataset is private and assigned to user BC.');
console.log();

