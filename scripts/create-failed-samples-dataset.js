#!/usr/bin/env node
/**
 * Create a new dataset from samples that were voted failed in MH
 * and assign it to housem2@montclair.edu
 * 
 * Usage:
 *   node scripts/create-failed-samples-dataset.js <csv-file>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomBytes } from 'crypto';
import db from '../backend/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get CSV file path from command line argument
const csvFilePath = process.argv[2] || path.join(__dirname, 'samples-votes-export-SP-70-2025-11-18T02-18-01.csv');
const targetEmail = 'housem2@montclair.edu';
const raterName = 'MH'; // Rater name to filter for

console.log('='.repeat(60));
console.log('Create Failed Samples Dataset');
console.log('='.repeat(60));
console.log(`CSV File: ${csvFilePath}`);
console.log(`Target User: ${targetEmail}`);
console.log(`Rater Filter: ${raterName}`);
console.log();

// Check if CSV file exists
if (!fs.existsSync(csvFilePath)) {
    console.error(`Error: CSV file not found: ${csvFilePath}`);
    process.exit(1);
}

// Simple CSV parser that handles quoted fields
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip next quote
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // Field separator
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    // Add last field
    result.push(current.trim());
    return result;
}

// Read and parse CSV
console.log('Reading CSV file...');
const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
const lines = csvContent.split('\n').filter(line => line.trim() !== '');

if (lines.length < 2) {
    console.error('Error: CSV file appears to be empty or invalid');
    process.exit(1);
}

// Parse header
const header = parseCSVLine(lines[0]);

// Parse records
const records = [];
for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const record = {};
    header.forEach((h, idx) => {
        record[h] = values[idx] || '';
    });
    records.push(record);
}

console.log(`✓ Loaded ${records.length} records from CSV\n`);

// Filter for failed samples (Rater Response = 0) from MH rater
// Also check if rater exists in the data, if not, get all failed samples
const allRaters = [...new Set(records.map(r => (r.Rater || '').trim()).filter(Boolean))];
console.log(`Available raters in CSV: ${allRaters.join(', ')}`);

console.log(`Filtering for failed samples (Rater Response = 0) from rater "${raterName}"...`);
let failedSamples = records.filter(row => {
    const rater = (row.Rater || '').trim();
    const response = (row['Rater Response'] || '').trim();
    return rater === raterName && response === '0';
});

// If no samples found with MH rater, try getting all failed samples
if (failedSamples.length === 0 && !allRaters.includes(raterName)) {
    console.log(`⚠️  Rater "${raterName}" not found in CSV. Getting all failed samples instead...`);
    failedSamples = records.filter(row => {
        const response = (row['Rater Response'] || '').trim();
        return response === '0';
    });
}

console.log(`✓ Found ${failedSamples.length} failed samples\n`);

if (failedSamples.length === 0) {
    console.log('⚠️  No failed samples found. Exiting.');
    process.exit(0);
}

// Get unique filenames
const uniqueFilenames = [...new Set(failedSamples.map(row => row.Filename.trim()))];
console.log(`✓ Found ${uniqueFilenames.length} unique filenames\n`);

// Get or create QC study
const studyName = 'QC';
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

// Create new dataset name
const datasetName = `MH_Failed_${new Date().toISOString().split('T')[0]}`;
const datasetDescription = `Samples that were voted failed by ${raterName} rater (${uniqueFilenames.length} samples)`;

console.log(`Creating dataset: ${datasetName}...`);
const insertDatasetStmt = db.prepare(`
  INSERT INTO datasets (study_id, name, description, image_path, is_ssh, ssh_path, is_public)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const datasetResult = insertDatasetStmt.run(
    studyId,
    datasetName,
    datasetDescription,
    'MH', // image_path - assuming images are in MH folder
    0, // is_ssh
    null, // ssh_path
    0 // is_public (private)
);

const datasetId = datasetResult.lastInsertRowid;
console.log(`✓ Created dataset: ${datasetName} (ID: ${datasetId})\n`);

// Helper function to generate secure token
function generateSecureToken() {
    return randomBytes(32).toString('hex');
}

// Find existing samples by filename and create new ones if needed
console.log('Finding or creating samples...');
const findSampleStmt = db.prepare(`
  SELECT id, dataset_id, filename FROM samples WHERE filename = ?
`);
const insertSampleStmt = db.prepare(`
  INSERT OR IGNORE INTO samples (dataset_id, filename, secure_token, file_path, ssh_path)
  VALUES (?, ?, ?, ?, ?)
`);

let samplesFound = 0;
let samplesCreated = 0;
const sampleIds = [];

// Get the data directory path
const dataDir = path.join(__dirname, '..', 'data');

for (const filename of uniqueFilenames) {
    // Check if sample already exists in this dataset
    const existingInDataset = db.prepare('SELECT id FROM samples WHERE dataset_id = ? AND filename = ?').get(datasetId, filename);

    if (existingInDataset) {
        // Sample already exists in this dataset
        sampleIds.push(existingInDataset.id);
        samplesFound++;
        continue;
    }

    // Check if sample exists in other datasets (for reference)
    const existingSample = findSampleStmt.get(filename);
    if (existingSample) {
        samplesFound++;
    }

    // Create new sample entry in the new dataset
    const secureToken = generateSecureToken();
    // Try to construct file path - check if file exists in various locations
    const possiblePaths = [
        path.join(dataDir, 'MH', filename),
        path.join(dataDir, 'SP', filename),
        path.join(dataDir, 'images', 'MH', filename),
        path.join(dataDir, 'images', 'SP', filename),
        path.join(dataDir, 'images', 'QC', 'MH', filename),
        path.join(dataDir, 'images', 'QC', 'SP', filename),
    ];

    let filePath = null;
    for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
            filePath = path.relative(dataDir, possiblePath);
            break;
        }
    }

    // If file not found, use a default path structure based on dataset
    if (!filePath) {
        filePath = `MH/${filename}`;
    }

    try {
        const result = insertSampleStmt.run(
            datasetId,
            filename,
            secureToken,
            filePath,
            null // ssh_path
        );

        if (result.changes > 0) {
            // Get the inserted sample ID
            const newSample = db.prepare('SELECT id FROM samples WHERE dataset_id = ? AND filename = ?').get(datasetId, filename);
            if (newSample) {
                sampleIds.push(newSample.id);
                samplesCreated++;
            }
        } else {
            // Sample might have been created by another process, try to get it
            const newSample = db.prepare('SELECT id FROM samples WHERE dataset_id = ? AND filename = ?').get(datasetId, filename);
            if (newSample) {
                sampleIds.push(newSample.id);
                samplesFound++;
            }
        }
    } catch (error) {
        console.error(`  ⚠️  Error creating sample ${filename}:`, error.message);
    }
}

console.log(`✓ Found ${samplesFound} existing samples`);
console.log(`✓ Created ${samplesCreated} new samples`);
console.log(`✓ Total samples in dataset: ${sampleIds.length}\n`);

// Get or create user
console.log(`Finding user: ${targetEmail}...`);
const getUserStmt = db.prepare('SELECT id, email FROM users WHERE email = ?');
let user = getUserStmt.get(targetEmail);

if (!user) {
    console.log(`⚠️  User not found: ${targetEmail}`);
    console.log(`   Please create the user first or check the email address.`);
    process.exit(1);
}

console.log(`✓ Found user: ${user.email} (ID: ${user.id})\n`);

// Grant dataset access to user
console.log('Granting dataset access to user...');
const insertAccessStmt = db.prepare(`
  INSERT OR IGNORE INTO user_dataset_access (user_id, dataset_id)
  VALUES (?, ?)
`);

try {
    insertAccessStmt.run(user.id, datasetId);
    console.log(`✓ Granted access to ${targetEmail} for dataset ${datasetName}\n`);
} catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
        console.log(`ℹ️  User already has access to this dataset\n`);
    } else {
        console.error(`✗ Error granting access:`, error.message);
        process.exit(1);
    }
}

// Optionally create sample assignments for the user
if (sampleIds.length > 0) {
    console.log('Creating sample assignments...');
    const insertAssignmentStmt = db.prepare(`
    INSERT OR IGNORE INTO sample_assignments (dataset_id, sample_id, user_id, assignment_type)
    VALUES (?, ?, ?, ?)
  `);

    let assignmentsCreated = 0;
    for (const sampleId of sampleIds) {
        try {
            insertAssignmentStmt.run(datasetId, sampleId, user.id, 'individual');
            assignmentsCreated++;
        } catch (error) {
            // Ignore unique constraint errors
            if (!error.message.includes('UNIQUE constraint')) {
                console.error(`  ⚠️  Error assigning sample ${sampleId}:`, error.message);
            }
        }
    }

    console.log(`✓ Created ${assignmentsCreated} sample assignments\n`);
}

console.log('='.repeat(60));
console.log('Summary');
console.log('='.repeat(60));
console.log(`Dataset: ${datasetName} (ID: ${datasetId})`);
console.log(`Samples: ${sampleIds.length}`);
console.log(`Assigned to: ${targetEmail}`);
console.log('='.repeat(60));
console.log('\n✓ Dataset created and assigned successfully!');
console.log();

