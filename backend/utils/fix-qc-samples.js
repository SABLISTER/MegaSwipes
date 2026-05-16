/**
 * Fix QC Samples Database
 * 
 * This script ensures that:
 * 1. Only samples from data/BC, data/RG, data/MH, data/SP folders exist in the database
 * 2. Each dataset (BC, RG, MH, SP) only contains samples from its corresponding folder
 * 3. Samples are matched to the correct dataset based on folder
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';

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

console.log('🔍 Fixing QC Samples Database...\n');
console.log(`Database: ${dbPath}`);
console.log(`Data directory: ${dataDir}\n`);

// User to folder mapping — update usernames to match your deployment
const userFolderMapping = {
    'user1': 'BC',
    'user2': 'SP',
    'user3': 'MH',
    'user4': 'RG'
};

// Valid folders
const validFolders = ['BC', 'RG', 'MH', 'SP'];

// Get QC study
const qcStudy = db.prepare('SELECT id, name FROM studies WHERE name = ?').get('QC');

if (!qcStudy) {
    console.error('❌ QC study not found in database');
    console.error('Please create the QC study first');
    db.close();
    process.exit(1);
}

console.log(`Found QC study: ${qcStudy.name} (ID: ${qcStudy.id})\n`);

// Get all QC datasets
const qcDatasets = db.prepare(`
  SELECT id, name 
  FROM datasets 
  WHERE study_id = ?
`).all(qcStudy.id);

console.log(`Found ${qcDatasets.length} QC datasets:`);
qcDatasets.forEach(ds => console.log(`  - ${ds.name} (ID: ${ds.id})`));
console.log('');

// Create a map of dataset name to ID
const datasetMap = {};
qcDatasets.forEach(ds => {
    datasetMap[ds.name] = ds.id;
});

// Create or get "Excluded" dataset for samples that don't match folders
let excludedDatasetId = datasetMap['Excluded'];
if (!excludedDatasetId) {
    console.log('Creating "Excluded" dataset for non-matching samples...');
    const insertExcluded = db.prepare(`
    INSERT INTO datasets (study_id, name, description, image_path, is_public, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
    const result = insertExcluded.run(
        qcStudy.id,
        'Excluded',
        'Samples that do not match BC/RG/MH/SP folder structure',
        'data/excluded',
        0  // Not public
    );
    excludedDatasetId = result.lastInsertRowid;
    datasetMap['Excluded'] = excludedDatasetId;
    console.log(`  Created Excluded dataset (ID: ${excludedDatasetId})\n`);
} else {
    console.log(`  Using existing Excluded dataset (ID: ${excludedDatasetId})\n`);
}

// Get all files in the data folders
console.log('📁 Scanning data folders...\n');
const folderFiles = {};

for (const folder of validFolders) {
    const folderPath = join(dataDir, folder);
    if (!existsSync(folderPath)) {
        console.warn(`⚠️  Folder ${folder} does not exist at ${folderPath}`);
        folderFiles[folder] = [];
        continue;
    }

    try {
        const files = readdirSync(folderPath)
            .filter(file => {
                const filePath = join(folderPath, file);
                return statSync(filePath).isFile() && file.toLowerCase().endsWith('.png');
            })
            .map(file => file.toLowerCase());

        folderFiles[folder] = files;
        console.log(`  ${folder}: ${files.length} PNG files`);
    } catch (error) {
        console.error(`  ❌ Error reading folder ${folder}:`, error.message);
        folderFiles[folder] = [];
    }
}

console.log('');

// Get all samples from QC datasets
const allSamples = db.prepare(`
  SELECT s.id, s.dataset_id, s.filename, s.file_path, d.name as dataset_name
  FROM samples s
  JOIN datasets d ON s.dataset_id = d.id
  WHERE d.study_id = ?
`).all(qcStudy.id);

console.log(`Found ${allSamples.length} samples in QC datasets\n`);

// Analyze samples
let samplesToDelete = [];
let samplesToUpdate = [];
let samplesToKeep = [];

for (const sample of allSamples) {
    const filename = sample.filename.toLowerCase();
    let matchedFolder = null;
    let shouldDelete = false;
    let shouldUpdate = false;

    // Check if file exists in any valid folder
    for (const folder of validFolders) {
        if (folderFiles[folder].includes(filename)) {
            matchedFolder = folder;
            break;
        }
    }

    // Extract folder from file_path if it exists
    let filePathFolder = null;
    if (sample.file_path) {
        const pathParts = sample.file_path.split('/');
        if (pathParts.length > 0 && validFolders.includes(pathParts[0])) {
            filePathFolder = pathParts[0];
        }
    }

    // Determine what to do with this sample
    if (!matchedFolder && !filePathFolder) {
        // File doesn't exist in any valid folder and file_path doesn't indicate a folder
        // Move to Excluded dataset instead of deleting
        shouldUpdate = true;
        samplesToUpdate.push({
            ...sample,
            correctDatasetId: excludedDatasetId,
            correctFolder: 'Excluded'
        });
    } else {
        // File exists or has a folder in file_path
        const correctFolder = matchedFolder || filePathFolder;
        const correctDatasetId = datasetMap[correctFolder];

        if (!correctDatasetId) {
            console.warn(`⚠️  No dataset found for folder ${correctFolder}`);
            shouldDelete = true;
            samplesToDelete.push(sample);
        } else if (sample.dataset_id !== correctDatasetId) {
            // Sample is in wrong dataset
            shouldUpdate = true;
            samplesToUpdate.push({
                ...sample,
                correctDatasetId,
                correctFolder
            });
        } else {
            // Sample is correct
            samplesToKeep.push(sample);
        }
    }
}

console.log('📊 Analysis Results:');
console.log(`  ✅ Keep: ${samplesToKeep.length}`);
console.log(`  🔄 Update: ${samplesToUpdate.length} (includes moving to Excluded)`);
console.log(`  📦 Move to Excluded: ${samplesToUpdate.filter(s => s.correctFolder === 'Excluded').length}\n`);

const excludedSamples = samplesToUpdate.filter(s => s.correctFolder === 'Excluded');
if (excludedSamples.length > 0) {
    console.log('Samples to move to Excluded:');
    excludedSamples.slice(0, 10).forEach(s => {
        console.log(`  - ID ${s.id}: ${s.filename} (from dataset: ${s.dataset_name})`);
    });
    if (excludedSamples.length > 10) {
        console.log(`  ... and ${excludedSamples.length - 10} more`);
    }
    console.log('');
}

if (samplesToUpdate.length > 0) {
    console.log('Samples to update (move to correct dataset):');
    samplesToUpdate.slice(0, 10).forEach(s => {
        console.log(`  - ID ${s.id}: ${s.filename} (${s.dataset_name} -> ${s.correctFolder})`);
    });
    if (samplesToUpdate.length > 10) {
        console.log(`  ... and ${samplesToUpdate.length - 10} more`);
    }
    console.log('');
}

// Ask for confirmation (in a real script, you might want to add a prompt)
console.log('⚠️  This will modify the database.');
console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

await new Promise(resolve => setTimeout(resolve, 5000));

// Perform updates
console.log('🔄 Updating database...\n');

const updateSampleStmt = db.prepare(`
  UPDATE samples 
  SET dataset_id = ?, 
      file_path = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

const processChanges = db.transaction(() => {
    // Update samples to correct dataset (including moving to Excluded)
    let updated = 0;
    for (const sample of samplesToUpdate) {
        const newFilePath = sample.correctFolder === 'Excluded'
            ? `excluded/${sample.filename}`
            : `${sample.correctFolder}/${sample.filename}`;
        updateSampleStmt.run(sample.correctDatasetId, newFilePath, sample.id);
        updated++;
    }

    return { updated };
});

const result = processChanges();

console.log('✅ Database update complete!');
console.log(`  Updated/Moved: ${result.updated} samples\n`);

// Verify results
console.log('🔍 Verifying results...\n');

for (const folder of validFolders) {
    const datasetId = datasetMap[folder];
    if (!datasetId) continue;

    const samplesInDataset = db.prepare(`
    SELECT COUNT(*) as count
    FROM samples
    WHERE dataset_id = ?
  `).get(datasetId);

    const filesInFolder = folderFiles[folder].length;

    console.log(`  ${folder}:`);
    console.log(`    Files in folder: ${filesInFolder}`);
    console.log(`    Samples in dataset: ${samplesInDataset.count}`);

    if (filesInFolder !== samplesInDataset.count) {
        console.warn(`    ⚠️  Mismatch! Some files may not be in database or vice versa`);
    }
}

// Show Excluded dataset count
if (excludedDatasetId) {
    const excludedCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM samples
    WHERE dataset_id = ?
  `).get(excludedDatasetId).count;

    console.log(`\n  Excluded:`);
    console.log(`    Samples in excluded dataset: ${excludedCount}`);
}

console.log('\n✅ Done!\n');

db.close();

