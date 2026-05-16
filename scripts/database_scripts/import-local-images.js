#!/usr/bin/env node

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

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Helpers
function generateSecureToken() {
    return randomBytes(32).toString('hex');
}

function findPNGFiles(dir) {
    console.log(`Scanning ${dir}...`);
    let results = [];
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
            console.warn(`Could not read directory ${currentDir}: ${err.message}`);
        }
    }
    return results;
}

async function main() {
    console.log('='.repeat(60));
    console.log('Import Local Images');
    console.log('='.repeat(60));
    console.log();

    if (!fs.existsSync(IMAGES_DIR)) {
        console.log(`❌ Images directory not found: ${IMAGES_DIR}`);
        rl.close();
        return;
    }

    // 1. Scan for potential datasets (top-level folders in data/images)
    console.log('Scanning data/images for datasets...');
    const items = fs.readdirSync(IMAGES_DIR, { withFileTypes: true });
    const potentialDatasets = items
        .filter(item => item.isDirectory())
        .map(item => item.name);
    console.log(`Found ${potentialDatasets.length} potential datasets.`);

    if (potentialDatasets.length === 0) {
        console.log('No folders found in data/images.');
        rl.close();
        return;
    }

    console.log('Found the following folders in data/images:');
    potentialDatasets.forEach((name, idx) => {
        // specific check if already in DB
        const exists = db.prepare('SELECT id FROM datasets WHERE name = ?').get(name);
        const status = exists ? '[Already in DB]' : '[New]';
        console.log(`${idx + 1}. ${name} ${status}`);
    });
    console.log();

    const result = await question('Enter the numbers of the folders you want to import (comma separated, e.g., 1,3): ');
    let selectedIndices = [];

    // REMOVED 'all' option per user request for safety
    selectedIndices = result.split(',')
        .map(s => parseInt(s.trim()) - 1)
        .filter(i => !isNaN(i) && i >= 0 && i < potentialDatasets.length);

    if (selectedIndices.length === 0) {
        console.log('No valid folders selected.');
        rl.close();
        return;
    }

    const selectedDatasets = selectedIndices.map(i => potentialDatasets[i]);
    console.log(`Debug: Selected datasets: ${JSON.stringify(selectedDatasets)}`);

    // 2. Select Study
    console.log('\nSelect a Study to assign these datasets to:');
    const studies = db.prepare('SELECT id, name FROM studies').all();
    studies.forEach((s, i) => console.log(`${i + 1}. ${s.name}`));
    console.log(`${studies.length + 1}. [Create New Study]`);

    const studyChoice = parseInt(await question('Enter choice: '));
    console.log(`Debug: Study choice entered: ${studyChoice}`);
    let studyId;

    if (studyChoice === studies.length + 1) {
        const newName = await question('Enter new Study Name: ');
        const newDesc = await question('Enter Study Description: ');
        const res = db.prepare('INSERT INTO studies (name, description) VALUES (?, ?)').run(newName, newDesc);
        studyId = res.lastInsertRowid;
        console.log(`Created study "${newName}" (ID: ${studyId})`);
    } else if (studyChoice > 0 && studyChoice <= studies.length) {
        studyId = studies[studyChoice - 1].id;
    } else {
        console.log('Invalid study selection.');
        rl.close();
        return;
    }

    // 3. Process Datasets
    console.log('Debug: Starting dataset processing loop...');
    for (const dsName of selectedDatasets) {
        console.log(`\n--------------------------------------------------`);
        console.log(`Processing Dataset: ${dsName}`);
        const dsPath = path.join(IMAGES_DIR, dsName);
        console.log(`Debug: Reading directory ${dsPath}`);

        // Check for "Sites" (subfolders)
        const items = fs.readdirSync(dsPath, { withFileTypes: true });
        const sites = items.filter(i => i.isDirectory()).map(i => i.name);
        let selectedSites = [];

        if (sites.length > 0) {
            console.log(`\nFound ${sites.length} potential Sites (subfolders) in ${dsName}:`);
            sites.forEach((site, idx) => console.log(`${idx + 1}. ${site}`));

            const siteResult = await question(`\nEnter the numbers of the Sites you want to import from ${dsName} (comma separated) or "all": `);

            if (siteResult.toLowerCase() === 'all') {
                selectedSites = sites;
            } else {
                const indices = siteResult.split(',')
                    .map(s => parseInt(s.trim()) - 1)
                    .filter(i => !isNaN(i) && i >= 0 && i < sites.length);
                selectedSites = indices.map(i => sites[i]);
            }
        } else {
            console.log(`\nNo subfolders (Sites) found in ${dsName}. searching for images in root...`);
            // No sites found, scan root of dataset
            selectedSites = [];
        }

        let dirsToScan = [];
        if (selectedSites.length > 0) {
            dirsToScan = selectedSites.map(s => path.join(dsPath, s));
        } else {
            // If manual site selection skippped but sites exist, we skip.
            if (sites.length > 0 && selectedSites.length === 0) {
                console.log('No sites selected. Skipping this dataset.');
                continue;
            }
            // If no sites exist at all, we scan root.
            dirsToScan = [dsPath];
        }

        console.log(`  Scanning for images in ${dirsToScan.length} location(s)...`);

        // --- DRY RUN / ANALYSIS ---
        let newSamples = [];
        let duplicateSamples = [];

        for (const dir of dirsToScan) {
            const pngs = findPNGFiles(dir);
            for (const file of pngs) {
                const dataDirAbs = path.resolve(__dirname, '../../data');
                const relPath = path.relative(dataDirAbs, file);

                const existing = db.prepare('SELECT id FROM samples WHERE file_path = ?').get(relPath);
                if (existing) {
                    duplicateSamples.push(relPath);
                } else {
                    newSamples.push({ file, relPath });
                }
            }
        }

        console.log(`\n  Analysis for dataset '${dsName}':`);
        console.log(`  - New images to import: ${newSamples.length}`);
        console.log(`  - Existing duplicates (will skip): ${duplicateSamples.length}`);

        if (newSamples.length === 0) {
            console.log('  Nothing new to import. Skipping.');
            continue;
        }

        console.log(`\n⚠️  You are about to write to the database.`);
        const confirm = await question(`  Proceed with importing ${newSamples.length} new images for '${dsName}'? (y/n): `);
        if (confirm.toLowerCase() !== 'y') {
            console.log('  Import cancelled by user.');
            continue;
        }

        // --- EXECUTION ---

        // Check/Create Dataset in DB
        let dataset = db.prepare('SELECT * FROM datasets WHERE name = ?').get(dsName);
        if (!dataset) {
            const res = db.prepare(`
                INSERT INTO datasets (study_id, name, image_path, is_public, description)
                VALUES (?, ?, ?, ?, ?)
            `).run(studyId, dsName, `images/${dsName}`, 0, `Imported from ${dsName}`);

            dataset = {
                id: res.lastInsertRowid,
                name: dsName
            };
            console.log(`  ✓ Created dataset entry (ID: ${dataset.id})`);
        } else {
            console.log(`  ✓ Using existing dataset (ID: ${dataset.id})`);
        }

        let added = 0;
        let errors = 0;

        const insertStmt = db.prepare(`
            INSERT INTO samples (dataset_id, filename, file_path, secure_token)
            VALUES (?, ?, ?, ?)
        `);

        // Use transaction for speed/safety
        const insertMany = db.transaction((samples) => {
            for (const item of samples) {
                const filename = path.basename(item.file);
                try {
                    insertStmt.run(dataset.id, filename, item.relPath, generateSecureToken());
                    added++;
                } catch (e) {
                    console.error(`  Error adding ${item.relPath}: ${e.message}`);
                    errors++;
                }
            }
        });

        insertMany(newSamples);
        console.log(`  ✓ Successfully added ${added} new samples.`);
        if (errors > 0) console.log(`  ⚠️  ${errors} errors occurred.`);
    }

    console.log('\nDone.');
    rl.close();
}

main().catch(err => {
    console.error(err);
    rl.close();
});
