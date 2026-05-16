#!/usr/bin/env node

/**
 * Import New Directories to Unassigned Dataset
 * 
 * This script scans /data/images for new directories and imports them
 * into the "Unassigned" study/dataset without any user assignment.
 * 
 * Features:
 * - Recursively searches directories for PNG images
 * - Creates an "Unassigned" study if it doesn't exist
 * - Creates individual datasets for each folder
 * - Skips already-imported images (by file_path)
 * 
 * Usage:
 *   node scripts/database_scripts/import-unassigned-directories.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomBytes } from 'crypto';
import readline from 'readline';
import db from '../../backend/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constants
const IMAGES_DIR = path.join(__dirname, '../../data/images');
const DATA_DIR = path.join(__dirname, '../../data');
const UNASSIGNED_STUDY_NAME = 'Unassigned';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Helper to generate secure tokens
function generateSecureToken() {
    return randomBytes(32).toString('hex');
}

/**
 * Recursively find all PNG files in a directory
 */
function findPNGFilesRecursively(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const stack = [dir];
    while (stack.length > 0) {
        const currentDir = stack.pop();
        try {
            const list = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const dirent of list) {
                const fullPath = path.join(currentDir, dirent.name);
                if (dirent.isDirectory()) {
                    stack.push(fullPath);
                } else if (dirent.isFile() && path.extname(dirent.name).toLowerCase() === '.png') {
                    results.push(fullPath);
                }
            }
        } catch (err) {
            console.warn(`  ⚠️  Could not read directory ${currentDir}: ${err.message}`);
        }
    }
    return results;
}

/**
 * Get or create the "Unassigned" study
 */
function getOrCreateUnassignedStudy() {
    let study = db.prepare('SELECT id, name FROM studies WHERE name = ?').get(UNASSIGNED_STUDY_NAME);

    if (!study) {
        console.log(`📋 Creating "${UNASSIGNED_STUDY_NAME}" study...`);
        const result = db.prepare(`
            INSERT INTO studies (name, description)
            VALUES (?, ?)
        `).run(UNASSIGNED_STUDY_NAME, 'Unassigned datasets - not yet assigned to any user');

        study = { id: result.lastInsertRowid, name: UNASSIGNED_STUDY_NAME };
        console.log(`✓ Created study: ${study.name} (ID: ${study.id})`);
    } else {
        console.log(`✓ Using existing study: ${study.name} (ID: ${study.id})`);
    }

    return study;
}

/**
 * Main import function
 */
async function main() {
    console.log('='.repeat(60));
    console.log('Import New Directory as Unassigned Dataset');
    console.log('='.repeat(60));
    console.log();

    // Ensure images directory exists
    if (!fs.existsSync(IMAGES_DIR)) {
        console.log(`Creating images directory: ${IMAGES_DIR}`);
        fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }

    // Scan for directories in data/images
    console.log(`Scanning ${IMAGES_DIR} for new directories...`);
    const items = fs.readdirSync(IMAGES_DIR, { withFileTypes: true });
    const allDirectories = items
        .filter(item => item.isDirectory())
        .map(item => item.name);

    if (allDirectories.length === 0) {
        console.log('\n❌ No directories found in data/images.');
        console.log('   Please add folders containing PNG images to:');
        console.log(`   ${IMAGES_DIR}`);
        rl.close();
        return;
    }

    // Filter to only directories NOT already in the database
    const newDirectories = [];
    for (const dirName of allDirectories) {
        const existingDataset = db.prepare('SELECT id FROM datasets WHERE name = ?').get(dirName);
        if (!existingDataset) {
            const dirPath = path.join(IMAGES_DIR, dirName);
            const pngFiles = findPNGFilesRecursively(dirPath);
            newDirectories.push({
                name: dirName,
                path: dirPath,
                imageCount: pngFiles.length
            });
        }
    }

    if (newDirectories.length === 0) {
        console.log('\n✓ No new directories found. All folders are already in the database.');
        rl.close();
        return;
    }

    console.log(`\nFound ${newDirectories.length} new directory(ies) not in database:\n`);

    // Show new directories
    newDirectories.forEach((d, idx) => {
        console.log(`  ${idx + 1}. ${d.name} (${d.imageCount} images found recursively)`);
    });
    console.log(`  0. Cancel`);

    const choice = await question('\nSelect a directory to import as a new dataset: ');
    const choiceNum = parseInt(choice.trim(), 10);

    if (choice.trim() === '0' || choice.trim() === '') {
        console.log('Import cancelled.');
        rl.close();
        return;
    }

    if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > newDirectories.length) {
        console.log(`Invalid selection. Please enter a number between 1 and ${newDirectories.length}.`);
        rl.close();
        return;
    }

    const selectedDir = newDirectories[choiceNum - 1];

    if (selectedDir.imageCount === 0) {
        console.log(`\n❌ No PNG images found in "${selectedDir.name}". Nothing to import.`);
        rl.close();
        return;
    }

    // Find all PNG files recursively for analysis
    const pngFiles = findPNGFilesRecursively(selectedDir.path);

    // Ask for dry-run or actual import
    console.log(`\nSelected: "${selectedDir.name}" with ${pngFiles.length} images`);
    console.log('\nOptions:');
    console.log('  1. Dry-run (preview what would be imported)');
    console.log('  2. Import (actually write to database)');
    console.log('  0. Cancel');

    const modeChoice = await question('\nSelect option: ');
    const modeNum = parseInt(modeChoice.trim(), 10);

    if (modeNum === 0 || modeChoice.trim() === '') {
        console.log('Import cancelled.');
        rl.close();
        return;
    }

    const isDryRun = modeNum === 1;

    if (modeNum !== 1 && modeNum !== 2) {
        console.log('Invalid option.');
        rl.close();
        return;
    }

    if (isDryRun) {
        // DRY RUN - Show what would be imported
        console.log('\n' + '='.repeat(60));
        console.log('DRY RUN - No changes will be made');
        console.log('='.repeat(60));
        console.log(`\nDataset: ${selectedDir.name}`);
        console.log(`Location: ${selectedDir.path}`);
        console.log(`Total images found: ${pngFiles.length}`);
        console.log('\nSample files that would be imported:');
        
        const samplesToShow = Math.min(20, pngFiles.length);
        for (let i = 0; i < samplesToShow; i++) {
            const relPath = path.relative(IMAGES_DIR, pngFiles[i]);
            console.log(`  - ${relPath}`);
        }
        if (pngFiles.length > 20) {
            console.log(`  ... and ${pngFiles.length - 20} more files`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('DRY RUN COMPLETE - No changes were made');
        console.log('='.repeat(60));
        console.log('\nRun again and select "Import" to actually import these files.\n');
        rl.close();
        return;
    }

    // ACTUAL IMPORT
    console.log(`\n⚠️  You are about to create a new dataset "${selectedDir.name}" with ${pngFiles.length} images.`);
    const confirm = await question('Proceed with import? (y/n): ');

    if (confirm.toLowerCase() !== 'y') {
        console.log('Import cancelled.');
        rl.close();
        return;
    }

    // Get or create the Unassigned study
    console.log('\n' + '-'.repeat(60));
    const study = getOrCreateUnassignedStudy();
    console.log('-'.repeat(60));

    // Create the new dataset
    console.log(`\n📁 Creating dataset: ${selectedDir.name}`);
    const imagePath = `images/${selectedDir.name}`;
    const datasetResult = db.prepare(`
        INSERT INTO datasets (study_id, name, description, image_path, is_public)
        VALUES (?, ?, ?, ?, ?)
    `).run(study.id, selectedDir.name, `Unassigned dataset from ${selectedDir.name}`, imagePath, 0);

    const datasetId = datasetResult.lastInsertRowid;
    console.log(`  ✓ Created dataset: ${selectedDir.name} (ID: ${datasetId})`);

    console.log(`  Found ${pngFiles.length} PNG files (recursive search)`);

    // Prepare insert statement
    const insertStmt = db.prepare(`
        INSERT INTO samples (dataset_id, filename, file_path, secure_token)
        VALUES (?, ?, ?, ?)
    `);

    console.log(`  Importing ${pngFiles.length} samples...`);

    // Use transaction for speed/safety
    let added = 0;
    let errors = 0;

    const importMany = db.transaction((files) => {
        for (const file of files) {
            const filename = path.basename(file);
            const relPath = path.relative(IMAGES_DIR, file);
            try {
                insertStmt.run(datasetId, filename, relPath, generateSecureToken());
                added++;
            } catch (e) {
                console.error(`    ✗ Error adding ${relPath}: ${e.message}`);
                errors++;
            }
        }
    });

    importMany(pngFiles);

    console.log(`  ✓ Successfully added ${added} samples.`);
    if (errors > 0) {
        console.log(`  ⚠️  ${errors} errors occurred.`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Import Summary');
    console.log('='.repeat(60));
    console.log(`Study: ${study.name} (ID: ${study.id})`);
    console.log(`Dataset: ${selectedDir.name} (ID: ${datasetId})`);
    console.log(`Total samples added: ${added}`);
    if (errors > 0) {
        console.log(`Errors: ${errors}`);
    }
    console.log('='.repeat(60));
    console.log('\n✓ Import complete.');
    console.log('  This dataset is in the "Unassigned" study.');
    console.log('  You can assign it to users via the admin interface.\n');

    rl.close();
}

main().catch(err => {
    console.error('Fatal error:', err);
    rl.close();
    process.exit(1);
});
