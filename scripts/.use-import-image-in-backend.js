#!/usr/bin/env node
/**
 * Import images from filesystem into local SQLite database
 * 
 * Usage:
 *   node scripts/import-images.js [--update]
 * 
 * This script will:
 * 1. Scan data/images/* for all subdirectories
 * 2. Create/update datasets.json with folder names and their image files
 * 3. Create datasets and samples in the database
 * 4. Skip existing datasets unless --update flag is provided
 * 
 * Example:
 *   node scripts/import-images.js           # Scan and import new datasets only
 *   node scripts/import-images.js --update  # Re-import all datasets
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const projectRoot = path.join(__dirname, '..');
const imagesDir = path.join(projectRoot, 'data', 'images');
const datasetsJsonPath = path.join(projectRoot, 'data', 'datasets.json');
const dbPath = path.join(projectRoot, 'data', 'neuroqc.db');

// Parse command line arguments
const args = process.argv.slice(2);
const forceUpdate = args.includes('--update');

// Image file extensions to look for
const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

/**
 * Check if a path is a directory
 */
function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (err) {
    return false;
  }
}

/**
 * Check if a file is an image based on extension
 */
function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return imageExtensions.includes(ext);
}

/**
 * Scan data/images directory and build datasets structure
 */
function scanImageDirectories() {
  console.log('📂 Scanning data/images directory...\n');

  if (!fs.existsSync(imagesDir)) {
    console.error(`Error: Directory ${imagesDir} does not exist`);
    process.exit(1);
  }

  const datasets = {};
  const entries = fs.readdirSync(imagesDir);

  for (const entry of entries) {
    const entryPath = path.join(imagesDir, entry);

    // Skip files, only process directories
    if (!isDirectory(entryPath)) {
      continue;
    }

    // Skip hidden directories
    if (entry.startsWith('.')) {
      continue;
    }

    // Get all image files in this directory
    const files = fs.readdirSync(entryPath)
      .filter(f => isImageFile(f))
      .sort();

    if (files.length > 0) {
      datasets[entry] = files;
      console.log(`   Found dataset "${entry}" with ${files.length} images`);
    }
  }

  const datasetCount = Object.keys(datasets).length;
  const totalImages = Object.values(datasets).reduce((sum, files) => sum + files.length, 0);

  console.log(`\n  Found ${datasetCount} datasets with ${totalImages} total images\n`);

  return datasets;
}

/**
 * Save datasets structure to JSON file
 */
function saveDatasetsJson(datasets) {
  console.log('  Saving datasets.json...');

  fs.writeFileSync(
    datasetsJsonPath,
    JSON.stringify(datasets, null, 2),
    'utf8'
  );

  console.log(`  Saved to ${datasetsJsonPath}\n`);
}

/**
 * Load existing datasets.json if it exists
 */
function loadDatasetsJson() {
  if (fs.existsSync(datasetsJsonPath)) {
    try {
      const content = fs.readFileSync(datasetsJsonPath, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      console.warn(`⚠️  Could not parse datasets.json: ${err.message}`);
      return {};
    }
  }
  return {};
}

/**
 * Import datasets into the database
 */
function importToDatabase(datasets) {
  console.log('   Connecting to database...');

  if (!fs.existsSync(dbPath)) {
    console.error(`Error: Database ${dbPath} does not exist`);
    console.error('Please run: node backend/init-database.js');
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  console.log(`  Connected to ${dbPath}\n`);

  // Get or create default study
  let study = db.prepare('SELECT id, name FROM studies WHERE name = ?')
    .get('CMI Brain Scan QC');

  if (!study) {
    console.log('  Creating default study...');
    const result = db.prepare(`
      INSERT INTO studies (name, description)
      VALUES (?, ?)
    `).run('CMI Brain Scan QC', 'Child Mind Institute neuroimaging quality control study');

    study = { id: result.lastInsertRowid, name: 'CMI Brain Scan QC' };
    console.log(`  Created study: ${study.name} (ID: ${study.id})\n`);
  } else {
    console.log(`  Using existing study: ${study.name} (ID: ${study.id})\n`);
  }

  const studyId = study.id;

  // Load existing datasets.json to check what's already been processed
  const existingDatasets = loadDatasetsJson();

  // Prepare SQL statements
  const getDatasetStmt = db.prepare('SELECT id, name FROM datasets WHERE image_path = ?');
  const insertDatasetStmt = db.prepare(`
    INSERT INTO datasets (study_id, name, description, image_path, is_public)
    VALUES (?, ?, ?, ?, 1)
  `);
  const insertSampleStmt = db.prepare(`
    INSERT OR IGNORE INTO samples (dataset_id, filename, secure_token, file_path)
    VALUES (?, ?, ?, ?)
  `);
  const deleteSamplesStmt = db.prepare('DELETE FROM samples WHERE dataset_id = ?');

  let totalImported = 0;
  let totalSkipped = 0;
  let datasetsCreated = 0;
  let datasetsUpdated = 0;
  let datasetsSkipped = 0;

  // Process each dataset
  for (const [folderName, files] of Object.entries(datasets)) {
    console.log(`\n  Processing dataset "${folderName}"...`);

    // Check if this dataset was already processed
    const wasProcessed = existingDatasets[folderName] !== undefined;

    if (wasProcessed && !forceUpdate) {
      console.log(`      Skipping (already processed, use --update to re-import)`);
      datasetsSkipped++;
      totalSkipped += files.length;
      continue;
    }

    // Check if dataset exists in database
    let dataset = getDatasetStmt.get(folderName);

    if (!dataset) {
      // Create new dataset
      const datasetName = `Dataset ${folderName}`;
      const description = `Brain imaging dataset from folder ${folderName}`;

      const result = insertDatasetStmt.run(studyId, datasetName, description, folderName);
      dataset = { id: result.lastInsertRowid, name: datasetName };

      console.log(`     Created dataset: ${dataset.name} (ID: ${dataset.id})`);
      datasetsCreated++;
    } else {
      console.log(`     Using existing dataset: ${dataset.name} (ID: ${dataset.id})`);

      if (forceUpdate) {
        console.log(`     Updating samples (--update flag)`);
        deleteSamplesStmt.run(dataset.id);
        datasetsUpdated++;
      }
    }

    // Import samples
    console.log(`     Importing ${files.length} images...`);

    let imported = 0;
    let skipped = 0;

    for (const filename of files) {
      const secureToken = randomUUID();
      const filePath = `${folderName}/${filename}`;
      const result = insertSampleStmt.run(dataset.id, filename, secureToken, filePath);

      if (result.changes > 0) {
        imported++;
      } else {
        skipped++;
      }
    }

    console.log(`     Imported: ${imported}, Skipped: ${skipped}`);

    totalImported += imported;
    totalSkipped += skipped;
  }

  db.close();

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('   Import Summary:');
  console.log('='.repeat(60));
  console.log(`   Datasets created: ${datasetsCreated}`);
  console.log(`   Datasets updated: ${datasetsUpdated}`);
  console.log(`   Datasets skipped: ${datasetsSkipped}`);
  console.log(`   Images imported: ${totalImported}`);
  console.log(`   Images skipped: ${totalSkipped}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Main function
 */
function main() {
  console.log('\n' + '='.repeat(60));
  console.log('CMI NeuroQC - Image Import Tool');
  console.log('='.repeat(60) + '\n');

  if (forceUpdate) {
    console.log('  Running in UPDATE mode (will re-import existing datasets)\n');
  }

  // Step 1: Scan directories
  const datasets = scanImageDirectories();

  if (Object.keys(datasets).length === 0) {
    console.log('   No datasets found. Exiting.');
    process.exit(0);
  }

  // Step 2: Save to JSON
  saveDatasetsJson(datasets);

  // Step 3: Import to database
  importToDatabase(datasets);

  console.log('  All done!\n');
}

// Run the script
try {
  main();
} catch (error) {
  console.error('\n  Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
}