#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomBytes } from 'crypto';
import db from '../backend/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const dataDir = path.join(__dirname, '..', 'data');
const folderName = 'RG_2';
const datasetName = 'RG_rereg';
const studyName = 'QC';

console.log('='.repeat(60));
console.log('Importing RG Reregistration Dataset');
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
    const description = `QC reregistration dataset for RG rater with ${pngFiles.length} images`;
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

// Check for existing samples before inserting
const checkSampleStmt = db.prepare(`
  SELECT id FROM samples WHERE dataset_id = ? AND filename = ?
`);

const insertSampleStmt = db.prepare(`
  INSERT INTO samples (dataset_id, filename, secure_token, file_path, ssh_path)
  VALUES (?, ?, ?, ?, ?)
`);

let imported = 0;
let skipped = 0;

console.log('Importing samples...');
for (const pngPath of pngFiles) {
    const filename = path.basename(pngPath);
    const relativePath = path.relative(dataDir, pngPath);
    
    // Check if sample already exists in this dataset
    const existing = checkSampleStmt.get(dataset.id, filename);
    
    if (existing) {
        // Sample already exists - skip it to preserve votes and other data
        skipped++;
        continue;
    }
    
    // Sample doesn't exist - insert it
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
        console.error(`  ✗ Error importing ${filename}:`, error.message);
    }
}

console.log('\n' + '='.repeat(60));
console.log('Import Summary');
console.log('='.repeat(60));
console.log(`Study: ${studyName} (ID: ${studyId})`);
console.log(`Dataset: ${datasetName} (ID: ${dataset.id})`);
console.log(`Total samples imported: ${imported}`);
if (skipped > 0) {
    console.log(`Samples skipped (already exist): ${skipped}`);
}
console.log('='.repeat(60));
console.log('\n✓ RG reregistration dataset import complete.');
console.log('  Dataset is private and ready for user assignment.');
console.log();

