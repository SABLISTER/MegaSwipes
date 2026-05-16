import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import readline from 'readline';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const dbPath = path.join(projectRoot, 'data', 'neuroqc.db');
const imagesBaseDir = path.join(projectRoot, 'data', 'images');

// Initialize database connection
let db;
try {
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
} catch (err) {
    console.error('Error connecting to database:', err.message);
    process.exit(1);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// BIDS parsing logic
function parseBidsFilename(filename) {
    // Extract subject ID (sub-XXXX)
    const subMatch = filename.match(/sub-([a-zA-Z0-9]+)/);
    if (!subMatch) return null;

    return {
        subjectId: `sub-${subMatch[1]}`,
    };
}

// Recursive file scanner
function scanDirectory(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            if (file !== 'node_modules' && !file.startsWith('.')) {
                scanDirectory(filePath, fileList);
            }
        } else {
            // Check for image extensions
            if (/\.(png|jpg|jpeg|gif|webp)$/i.test(file)) {
                fileList.push(filePath);
            }
        }
    });

    return fileList;
}

function sanitizeName(name) {
    return name
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '');
}

async function main() {
    console.log('='.repeat(60));
    console.log('Register BIDS Images');
    console.log('='.repeat(60));
    console.log();

    // 1. Get directory to scan
    let scanDir = await question('Enter directory path to scan for images: ');
    scanDir = scanDir.trim();

    // Handle relative paths
    if (!path.isAbsolute(scanDir)) {
        scanDir = path.resolve(process.cwd(), scanDir);
    }

    if (!fs.existsSync(scanDir)) {
        console.error(`Error: Directory not found: ${scanDir}`);
        rl.close();
        return;
    }

    console.log(`Scanning ${scanDir}...`);
    const allImages = scanDirectory(scanDir);
    console.log(`Found ${allImages.length} images.`);

    // 2. Group by subject
    const subjectGroups = new Map(); // subjectId -> [files]
    const skippedFiles = [];

    allImages.forEach(filePath => {
        const filename = path.basename(filePath);
        const bidsInfo = parseBidsFilename(filename);

        if (bidsInfo) {
            if (!subjectGroups.has(bidsInfo.subjectId)) {
                subjectGroups.set(bidsInfo.subjectId, []);
            }
            subjectGroups.get(bidsInfo.subjectId).push({
                filename,
                sourcePath: filePath
            });
        } else {
            skippedFiles.push(filename);
        }
    });

    console.log(`Identified ${subjectGroups.size} subjects.`);
    if (skippedFiles.length > 0) {
        console.log(`Skipped ${skippedFiles.length} non-BIDS images.`);
    }

    if (subjectGroups.size === 0) {
        console.log('No BIDS subjects found. Exiting.');
        rl.close();
        return;
    }

    // 3. Select Dataset
    const studies = db.prepare('SELECT * FROM studies').all();
    const datasets = db.prepare('SELECT * FROM datasets').all();

    console.log('\nAvailable Datasets:');
    datasets.forEach((d, i) => {
        const study = studies.find(s => s.id === d.study_id);
        console.log(`${i + 1}. ${d.name} (Study: ${study ? study.name : 'Unknown'})`);
    });
    console.log(`${datasets.length + 1}. Create New Dataset`);

    let datasetChoice = await question(`\nSelect dataset (1-${datasets.length + 1}): `);
    datasetChoice = parseInt(datasetChoice);

    let targetDataset;
    let targetStudy;

    if (datasetChoice === datasets.length + 1) {
        // Create new dataset
        console.log('\nCreating New Dataset');

        // Select Study
        console.log('Select Study for new dataset:');
        studies.forEach((s, i) => console.log(`${i + 1}. ${s.name}`));
        console.log(`${studies.length + 1}. Create New Study`);

        let studyChoice = await question(`Select study (1-${studies.length + 1}): `);
        studyChoice = parseInt(studyChoice);

        if (studyChoice === studies.length + 1) {
            const newStudyName = await question('Enter new study name: ');
            const newStudyDesc = await question('Enter description (optional): ');
            const info = db.prepare('INSERT INTO studies (name, description) VALUES (?, ?)').run(newStudyName, newStudyDesc);
            targetStudy = { id: info.lastInsertRowid, name: newStudyName };
            console.log(`Created study '${newStudyName}' with ID ${targetStudy.id}`);
        } else {
            targetStudy = studies[studyChoice - 1];
        }

        const newDatasetName = await question('Enter new dataset name: ');
        const newDatasetDesc = await question('Enter description (optional): ');

        // Determine site from dataset name or default
        // Pattern: HBN_XXX -> site is XXX
        const hbnMatch = newDatasetName.match(/^HBN_(.+)$/);
        const site = hbnMatch ? hbnMatch[1] : 'default';

        // Construct image path identifier (used for folder naming)
        const datasetPath = sanitizeName(newDatasetName);

        const info = db.prepare('INSERT INTO datasets (study_id, name, description, image_path, is_public) VALUES (?, ?, ?, ?, 1)').run(targetStudy.id, newDatasetName, newDatasetDesc, datasetPath);
        targetDataset = {
            id: info.lastInsertRowid,
            name: newDatasetName,
            study_id: targetStudy.id,
            image_path: datasetPath,
            site: site
        };
        console.log(`Created dataset '${newDatasetName}' with ID ${targetDataset.id}`);

    } else if (datasetChoice > 0 && datasetChoice <= datasets.length) {
        targetDataset = datasets[datasetChoice - 1];
        targetStudy = studies.find(s => s.id === targetDataset.study_id);

        // Determine site
        const hbnMatch = targetDataset.name.match(/^HBN_(.+)$/);
        targetDataset.site = hbnMatch ? hbnMatch[1] : 'default';
    } else {
        console.log('Invalid choice.');
        rl.close();
        return;
    }

    // 4. Register Images
    console.log('\nRegistering images...');
    const insertStmt = db.prepare('INSERT OR IGNORE INTO samples (dataset_id, filename, file_path, secure_token) VALUES (?, ?, ?, ?)');

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    // Prepare target directory base: data/images/Study/Dataset/Site/
    const studyDirName = sanitizeName(targetStudy.name);
    const datasetDirName = sanitizeName(targetDataset.name);
    const siteDirName = targetDataset.site;

    const targetBaseDir = path.join(imagesBaseDir, studyDirName, datasetDirName, siteDirName);

    console.log(`Target directory: ${targetBaseDir}`);

    for (const [subjectId, images] of subjectGroups) {
        // Create subject directory: data/images/Study/Dataset/Site/sub-XXXX
        const subjectDir = path.join(targetBaseDir, subjectId);

        if (!fs.existsSync(subjectDir)) {
            fs.mkdirSync(subjectDir, { recursive: true });
        }

        for (const img of images) {
            try {
                const targetPath = path.join(subjectDir, img.filename);

                // Copy file if it doesn't exist or overwrite? 
                // Let's check existence to avoid unnecessary writes, but we should ensure it's there.
                if (!fs.existsSync(targetPath)) {
                    fs.copyFileSync(img.sourcePath, targetPath);
                }

                // Calculate relative path for DB: Study/Dataset/Site/sub-XXXX/filename.png
                // This matches the "New Structure" logic in image-routes.js
                const dbFilePath = path.join(studyDirName, datasetDirName, siteDirName, subjectId, img.filename);

                const result = insertStmt.run(targetDataset.id, img.filename, dbFilePath, randomUUID());

                if (result.changes > 0) {
                    successCount++;
                } else {
                    skippedCount++; // Already exists in DB
                }
            } catch (err) {
                console.error(`Failed to register ${img.filename}: ${err.message}`);
                failCount++;
            }
        }
    }

    console.log(`\nSummary:`);
    console.log(`Successfully registered: ${successCount}`);
    console.log(`Skipped (already in DB): ${skippedCount}`);
    console.log(`Failed: ${failCount}`);

    rl.close();
}

main().catch(err => {
    console.error(err);
    rl.close();
});
