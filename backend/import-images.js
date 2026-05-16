#!/usr/bin/env node
/**
 * Import images from filesystem (local or SSH) into local SQLite database
 * 
 * This script:
 * 1. Scans local data/images or SSH paths recursively for sub-* folders
 * 2. Groups 4 images per subject (sub-* folder) 
 * 3. Creates datasets from parent folder names (ABIDE, HBN_RU, etc.)
 * 4. Updates database with subjects and their images
 * 
 * Usage:
 *   node backend/import-images.js [--ssh] [--update] [--non-interactive] [--path <path>]
 * 
 * Options:
 *   --ssh              Use SSH connection for remote imports
 *   --update           Re-import existing datasets (will delete existing samples)
 *   --non-interactive  Skip interactive prompts (uses defaults)
 *   --path <path>      Specify base path (local or SSH remote path)
 * 
 * Interactive Mode (default):
 *   - Prompts to select/create a study
 *   - Prompts for dataset name, site, description, and visibility
 *   - Shows summary before importing
 *   - Confirms before proceeding
 */

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import readline from 'readline';
import dotenv from 'dotenv';
import sshService from './ssh-service.js';
import db from './database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const useSSH = args.includes('--ssh');
const forceUpdate = args.includes('--update');
const nonInteractive = args.includes('--non-interactive'); // Skip interactive prompts
const pathIndex = args.indexOf('--path');
const customPath = pathIndex !== -1 ? args[pathIndex + 1] : null;

// Paths
const projectRoot = path.join(__dirname, '..');
const localImagesDir = customPath || path.join(projectRoot, 'data', 'images');
const dbPath = path.join(projectRoot, 'data', 'neuroqc.db');

// Image file extensions
const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
const SUBJECT_PREFIX = 'sub-';

/**
 * Check if a filename matches subject folder pattern (sub-*)
 */
function isSubjectFolder(folderName) {
  return folderName.startsWith(SUBJECT_PREFIX);
}

/**
 * Check if a file is an image based on extension
 */
function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return imageExtensions.includes(ext);
}

/**
 * Sanitize study name for filesystem use
 * Replaces spaces and special characters with underscores
 */
function sanitizeStudyName(studyName) {
  return studyName
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Extract site from dataset name
 * Examples:
 * - HBN_CUNY -> CUNY
 * - HBN_CBIC -> CBIC
 * - HBN_RU -> RU
 * - ABIDE_I -> default (no site)
 */
function extractSiteFromDataset(datasetName) {
  // Pattern: HBN_XXX -> site is XXX
  const hbnMatch = datasetName.match(/^HBN_(.+)$/);
  if (hbnMatch) {
    return hbnMatch[1];
  }

  // For other datasets, use "default" as site
  return 'default';
}

/**
 * Build new file path structure: study/dataset/site/subject/images.png
 */
function buildNewFilePath(studyName, datasetName, site, subjectId, imageFilename) {
  const sanitizedStudy = sanitizeStudyName(studyName);
  return path.join(sanitizedStudy, datasetName, site, subjectId, imageFilename);
}

/**
 * Create readline interface for user input
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Prompt user for input
 */
function question(rl, query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

/**
 * Prompt user to select from a list
 */
async function selectFromList(rl, items, promptText, allowNew = false) {
  if (items.length === 0 && !allowNew) {
    throw new Error('No items available to select from');
  }

  console.log(`\n${promptText}`);
  items.forEach((item, index) => {
    const displayName = typeof item === 'string' ? item : (item.name || item);
    console.log(`  ${index + 1}. ${displayName}`);
  });
  if (allowNew) {
    console.log(`  ${items.length + 1}. Create new`);
  }

  while (true) {
    const answer = await question(rl, `\nSelect option (1-${items.length + (allowNew ? 1 : 0)}): `);
    const choice = parseInt(answer.trim());

    if (choice >= 1 && choice <= items.length) {
      return items[choice - 1];
    } else if (allowNew && choice === items.length + 1) {
      return null; // Signal to create new
    } else {
      console.log('   Invalid choice. Please try again.');
    }
  }
}

/**
 * Get all studies from database
 */
function getStudies() {
  return db.prepare('SELECT id, name, description FROM studies ORDER BY name').all();
}

/**
 * Create new study
 */
function createStudy(name, description) {
  const result = db.prepare(`
    INSERT INTO studies (name, description)
    VALUES (?, ?)
  `).run(name, description || null);

  return { id: result.lastInsertRowid, name, description };
}

/**
 * Recursively find all sub-* folders in a directory (local filesystem)
 */
function findSubjectFoldersLocal(basePath, datasetName = null) {
  const subjects = [];

  if (!fs.existsSync(basePath)) {
    return subjects;
  }

  function scanDirectory(dirPath, currentDataset = null) {
    try {
      const entries = fs.readdirSync(dirPath);

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);

        // Skip hidden files/folders
        if (entry.startsWith('.')) {
          continue;
        }

        try {
          const stats = fs.statSync(entryPath);

          if (stats.isDirectory()) {
            // If this is a subject folder, collect images
            if (isSubjectFolder(entry)) {
              // Determine dataset name: use parent folder name or current dataset name
              // For nested structures like: basePath/ABIDE/sub-123/, dataset should be ABIDE
              const parentPath = path.dirname(entryPath);
              const dataset = currentDataset || datasetName || path.basename(parentPath);

              const allImages = fs.readdirSync(entryPath)
                .filter(f => isImageFile(f))
                .sort();

              // Take up to 4 images
              const images = allImages.slice(0, 4);

              if (images.length > 0) {
                console.log(`     Found subject ${entry} with ${images.length} images (${allImages.length} total)`);
                subjects.push({
                  subjectId: entry,
                  datasetName: dataset,
                  folderPath: path.relative(basePath, entryPath),
                  fullPath: entryPath,
                  images: images.map(img => ({
                    filename: img,
                    path: path.join(entry, img),
                    fullPath: path.join(entryPath, img)
                  }))
                });
              }
            } else {
              // Recurse into subdirectories, passing current folder as potential dataset name
              // This ensures nested subjects get the correct parent folder as dataset name
              const nextDataset = currentDataset || entry;
              scanDirectory(entryPath, nextDataset);
            }
          }
        } catch (err) {
          console.warn(`   ⚠️  Error scanning ${entryPath}: ${err.message}`);
        }
      }
    } catch (err) {
      console.warn(`   ⚠️  Error reading directory ${dirPath}: ${err.message}`);
    }
  }

  scanDirectory(basePath);
  return subjects;
}

/**
 * Recursively find all sub-* folders in a directory (SSH)
 */
async function findSubjectFoldersSSH(basePath, datasetName = null) {
  const subjects = [];

  // Check if SSH connection is available
  try {
    await sshService.ensureConnected();
  } catch (err) {
    throw new Error(`SSH connection failed: ${err.message}`);
  }

  async function scanDirectory(remotePath, currentDataset = null) {
    try {
      const entries = await sshService.listDirectories(remotePath);

      for (const entry of entries) {
        // Skip hidden files/folders
        if (entry.startsWith('.')) {
          continue;
        }

        const entryPath = `${remotePath}/${entry}`;

        try {
          // Check if it's a directory by trying to list it
          try {
            const stats = await sshService.getStats(entryPath);
            if (!stats.isDirectory()) {
              continue;
            }
          } catch (err) {
            // If we can't get stats, it might not be a directory
            continue;
          }

          // If this is a subject folder, collect images
          if (isSubjectFolder(entry)) {
            // Determine dataset name: use parent folder name or current dataset name
            // For nested structures like: basePath/ABIDE/sub-123/, dataset should be ABIDE
            const pathParts = entryPath.replace(basePath, '').split('/').filter(p => p);
            const dataset = currentDataset || (pathParts.length > 1 ? pathParts[pathParts.length - 2] : pathParts[0]) || entry.split('/').slice(-2)[0];

            // Collect images from all supported extensions
            const allImages = [];
            try {
              for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.webp']) {
                try {
                  const files = await sshService.listFiles(entryPath, ext);
                  allImages.push(...files);
                } catch (err) {
                  // Extension might not have files, continue
                }
              }
            } catch (err) {
              console.warn(`   ⚠️  Error listing files in ${entryPath}: ${err.message}`);
            }

            const imageFiles = [...new Set(allImages)] // Remove duplicates
              .filter(f => isImageFile(f))
              .sort()
              .slice(0, 4); // Take first 4 images

            if (imageFiles.length > 0) {
              console.log(`     Found subject ${entry} with ${imageFiles.length} images (${allImages.length} total)`);
              subjects.push({
                subjectId: entry,
                datasetName: dataset,
                folderPath: entryPath.replace(basePath, '').replace(/^\//, ''),
                fullPath: entryPath,
                images: imageFiles.map(img => ({
                  filename: img,
                  path: `${entry}/${img}`,
                  fullPath: `${entryPath}/${img}`
                }))
              });
            }
          } else {
            // Recurse into subdirectories
            // Use current folder name as potential dataset name for nested subjects
            const nextDataset = currentDataset || entry;
            await scanDirectory(entryPath, nextDataset);
          }
        } catch (err) {
          console.warn(`   ⚠️  Error scanning ${entryPath}: ${err.message}`);
        }
      }
    } catch (err) {
      console.warn(`   ⚠️  Error reading directory ${remotePath}: ${err.message}`);
    }
  }

  await scanDirectory(basePath);
  return subjects;
}

/**
 * Scan for subjects and organize by dataset
 */
async function scanForSubjects(basePath) {
  console.log('📂 Scanning for subject folders...\n');

  if (useSSH) {
    console.log(`   Using SSH: ${basePath}\n`);
    return await findSubjectFoldersSSH(basePath);
  } else {
    console.log(`   Using local filesystem: ${basePath}\n`);
    return findSubjectFoldersLocal(basePath);
  }
}

/**
 * Organize subjects by dataset name
 */
function organizeByDataset(subjects) {
  const datasets = {};

  for (const subject of subjects) {
    const datasetName = subject.datasetName;

    if (!datasets[datasetName]) {
      datasets[datasetName] = {
        name: datasetName,
        subjects: []
      };
    }

    datasets[datasetName].subjects.push(subject);
  }

  return datasets;
}

/**
 * Import datasets and subjects to database (interactive mode)
 */
async function importToDatabaseInteractive(datasets, rl) {
  console.log('\n' + '='.repeat(60));
  console.log('   Interactive Import Configuration');
  console.log('='.repeat(60) + '\n');

  // Get all studies
  const studies = getStudies();
  let selectedStudy;

  if (studies.length === 0) {
    console.log('   No studies found. Creating a new study is required.\n');
    const studyName = await question(rl, '   Study name: ');
    const studyDesc = await question(rl, '   Study description (optional): ');
    selectedStudy = createStudy(studyName.trim(), studyDesc.trim() || null);
    console.log(`   ✓ Created study: ${selectedStudy.name}\n`);
  } else {
    selectedStudy = await selectFromList(
      rl,
      studies,
      '   Select a study:',
      true
    );

    if (!selectedStudy) {
      // Create new study
      const studyName = await question(rl, '\n   Study name: ');
      const studyDesc = await question(rl, '   Study description (optional): ');
      selectedStudy = createStudy(studyName.trim(), studyDesc.trim() || null);
      console.log(`   ✓ Created study: ${selectedStudy.name}\n`);
    }
  }

  const studyId = selectedStudy.id;
  const studyName = selectedStudy.name;

  // Process each dataset found
  const processedDatasets = {};

  for (const [datasetName, datasetData] of Object.entries(datasets)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`   Configuring Dataset: ${datasetName}`);
    console.log(`   Found ${datasetData.subjects.length} subjects with ${datasetData.subjects.reduce((sum, s) => sum + s.images.length, 0)} images`);
    console.log('='.repeat(60) + '\n');

    // Ask for dataset name
    const customDatasetName = await question(rl, `   Dataset name [${datasetName}]: `);
    const finalDatasetName = customDatasetName.trim() || datasetName;

    // Ask for site
    const suggestedSite = extractSiteFromDataset(finalDatasetName);
    const customSite = await question(rl, `   Site [${suggestedSite}]: `);
    const finalSite = customSite.trim() || suggestedSite;

    // Ask for description
    const description = await question(rl, `   Dataset description (optional): `);

    // Ask if public
    const isPublicAnswer = await question(rl, `   Make dataset public? (Y/n): `);
    const isPublic = isPublicAnswer.trim().toLowerCase() !== 'n';

    processedDatasets[datasetName] = {
      ...datasetData,
      config: {
        name: finalDatasetName,
        site: finalSite,
        description: description.trim() || null,
        isPublic: isPublic ? 1 : 0,
        studyId,
        studyName
      }
    };

    console.log(`   ✓ Configured: ${finalDatasetName} (site: ${finalSite}, ${isPublic ? 'public' : 'private'})\n`);
  }

  // Confirm import
  console.log('\n' + '='.repeat(60));
  console.log('   Import Summary:');
  console.log('='.repeat(60));
  for (const [originalName, data] of Object.entries(processedDatasets)) {
    console.log(`   ${data.config.name} (${data.subjects.length} subjects, ${data.subjects.reduce((sum, s) => sum + s.images.length, 0)} images)`);
  }
  console.log('='.repeat(60) + '\n');

  const confirm = await question(rl, '   Proceed with import? (Y/n): ');
  if (confirm.trim().toLowerCase() === 'n') {
    console.log('\n   Import cancelled.\n');
    return;
  }

  // Now import
  await performImport(processedDatasets, studyId, studyName);
}

/**
 * Import datasets and subjects to database (non-interactive mode)
 */
async function importToDatabase(datasets) {
  console.log('   Connecting to database...');

  if (!fs.existsSync(dbPath)) {
    console.error(`Error: Database ${dbPath} does not exist`);
    console.error('Please run: node backend/init-database.js');
    process.exit(1);
  }

  // Use the shared database module instead of creating a new instance
  // This ensures we use the same database connection as the rest of the app
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
  const defaultStudyName = study.name;

  // Prepare SQL statements
  const getDatasetStmt = db.prepare(`
    SELECT d.id, d.name, d.study_id, st.name as study_name
    FROM datasets d
    LEFT JOIN studies st ON d.study_id = st.id
    WHERE d.image_path = ?
  `);
  const insertDatasetStmt = db.prepare(`
    INSERT INTO datasets (study_id, name, description, image_path, is_ssh, ssh_path, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSampleStmt = db.prepare(`
    INSERT OR IGNORE INTO samples (dataset_id, filename, secure_token, file_path, ssh_path)
    VALUES (?, ?, ?, ?, ?)
  `);
  const deleteSamplesStmt = db.prepare('DELETE FROM samples WHERE dataset_id = ?');
  const getStudyStmt = db.prepare('SELECT id, name FROM studies WHERE id = ?');

  let totalImported = 0;
  let totalSkipped = 0;
  let datasetsCreated = 0;
  let datasetsUpdated = 0;
  let datasetsSkipped = 0;
  let totalSubjects = 0;

  // Process each dataset
  for (const [datasetName, datasetData] of Object.entries(datasets)) {
    console.log(`\n  Processing dataset "${datasetName}"...`);
    console.log(`     Found ${datasetData.subjects.length} subjects`);

    // Check if dataset exists in database
    let dataset = getDatasetStmt.get(datasetName);

    if (!dataset) {
      // Create new dataset
      const description = `Brain imaging dataset: ${datasetName} with ${datasetData.subjects.length} subjects`;
      const isSSH = useSSH ? 1 : 0;
      const sshPath = useSSH ? datasetName : null;

      const result = insertDatasetStmt.run(
        studyId,
        datasetName,
        description,
        datasetName,
        isSSH,
        sshPath || null,
        1 // is_public
      );
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

    // Get the study for this dataset
    let datasetStudy = null;
    if (dataset.study_id) {
      datasetStudy = getStudyStmt.get(dataset.study_id);
    }
    const currentStudyName = (datasetStudy && datasetStudy.name) || defaultStudyName;
    const site = extractSiteFromDataset(datasetName);

    // Import subjects and their images
    await performDatasetImport(dataset, datasetData, currentStudyName, datasetName, site, useSSH);

    totalSubjects += datasetData.subjects.length;
    totalImported += datasetData.subjects.reduce((sum, s) => sum + s.images.length, 0);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('   Import Summary:');
  console.log('='.repeat(60));
  console.log(`   Datasets created: ${datasetsCreated}`);
  console.log(`   Datasets updated: ${datasetsUpdated}`);
  console.log(`   Datasets skipped: ${datasetsSkipped}`);
  console.log(`   Total subjects: ${totalSubjects}`);
  console.log(`   Images imported: ${totalImported}`);
  console.log(`   Images skipped: ${totalSkipped}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Perform the actual import for a dataset
 */
async function performImport(processedDatasets, studyId, studyName) {
  const insertDatasetStmt = db.prepare(`
    INSERT INTO datasets (study_id, name, description, image_path, is_ssh, ssh_path, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const getDatasetStmt = db.prepare('SELECT id, name FROM datasets WHERE image_path = ?');
  const deleteSamplesStmt = db.prepare('DELETE FROM samples WHERE dataset_id = ?');

  let totalImported = 0;
  let totalSkipped = 0;
  let datasetsCreated = 0;
  let datasetsUpdated = 0;
  let totalSubjects = 0;

  for (const [originalName, data] of Object.entries(processedDatasets)) {
    const config = data.config;
    console.log(`\n  Processing dataset "${config.name}"...`);

    // Check if dataset exists
    let dataset = getDatasetStmt.get(config.name);

    if (!dataset) {
      const result = insertDatasetStmt.run(
        config.studyId,
        config.name,
        config.description,
        config.name,
        useSSH ? 1 : 0,
        useSSH ? config.name : null,
        config.isPublic
      );
      dataset = { id: result.lastInsertRowid, name: config.name };
      datasetsCreated++;
      console.log(`     Created dataset: ${dataset.name} (ID: ${dataset.id})`);
    } else {
      console.log(`     Using existing dataset: ${dataset.name} (ID: ${dataset.id})`);
      if (forceUpdate) {
        deleteSamplesStmt.run(dataset.id);
        datasetsUpdated++;
      }
    }

    await performDatasetImport(dataset, data, config.studyName, config.name, config.site, useSSH);

    totalSubjects += data.subjects.length;
    totalImported += data.subjects.reduce((sum, s) => sum + s.images.length, 0);
  }

  console.log('\n' + '='.repeat(60));
  console.log('   Import Complete!');
  console.log('='.repeat(60));
  console.log(`   Datasets created: ${datasetsCreated}`);
  console.log(`   Datasets updated: ${datasetsUpdated}`);
  console.log(`   Total subjects: ${totalSubjects}`);
  console.log(`   Images imported: ${totalImported}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Perform import for a single dataset
 */
async function performDatasetImport(dataset, datasetData, studyName, datasetName, site, useSSH) {
  /* 
    Updated to explicitly check for existence instead of relying on INSERT OR IGNORE 
    since the unique constraint might be missing.
  */
  const checkSampleStmt = db.prepare('SELECT id FROM samples WHERE dataset_id = ? AND filename = ?');
  const insertSampleStmt = db.prepare(`
    INSERT INTO samples (dataset_id, filename, secure_token, file_path, ssh_path)
    VALUES (?, ?, ?, ?, ?)
  `);

  const imagesBaseDir = path.join(projectRoot, 'data', 'images');
  let imported = 0;
  let skipped = 0;

  for (const subject of datasetData.subjects) {
    for (const image of subject.images) {
      const secureToken = randomUUID();
      const newFilePath = buildNewFilePath(studyName, datasetName, site, subject.subjectId, image.filename);

      if (!useSSH) {
        const newFullPath = path.join(imagesBaseDir, newFilePath);
        const newDir = path.dirname(newFullPath);

        if (!fs.existsSync(newDir)) {
          fs.mkdirSync(newDir, { recursive: true });
        }

        try {
          if (fs.existsSync(image.fullPath)) {
            fs.copyFileSync(image.fullPath, newFullPath);
          }
        } catch (err) {
          console.warn(`     ⚠️  Could not copy ${image.fullPath} to ${newFullPath}: ${err.message}`);
        }
      }

      const filePath = newFilePath;
      const sshPath = useSSH ? image.fullPath : null;

      // Check if sample already exists
      const existing = checkSampleStmt.get(dataset.id, image.filename);

      if (existing) {
        skipped++;
        continue;
      }

      insertSampleStmt.run(
        dataset.id,
        image.filename,
        secureToken,
        filePath,
        sshPath
      );
      imported++;
    }
  }

  console.log(`     Imported: ${imported} images from ${datasetData.subjects.length} subjects`);
  if (skipped > 0) {
    console.log(`     Skipped: ${skipped} images (already exists)`);
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('CMI NeuroQC - Image Import Tool');
  console.log('='.repeat(60) + '\n');

  if (useSSH) {
    console.log('  Mode: SSH Import\n');
  } else {
    console.log('  Mode: Local Import\n');
  }

  if (forceUpdate) {
    console.log('  Running in UPDATE mode (will re-import existing datasets)\n');
  }

  // Determine base path
  let basePath;
  if (useSSH) {
    basePath = customPath || process.env.SSH_BASE_PATH || '/data4/asd_meganalysis/SI_test_MH/pulls_for_abide';
  } else {
    basePath = customPath || localImagesDir;
  }

  console.log(`  Base path: ${basePath}\n`);

  // Step 1: Scan for subjects
  const subjects = await scanForSubjects(basePath);

  if (subjects.length === 0) {
    console.log('   No subjects found. Exiting.');
    if (useSSH) {
      sshService.disconnect();
    }
    process.exit(0);
  }

  console.log(`\n  Found ${subjects.length} subjects total\n`);

  // Step 2: Organize by dataset
  const datasets = organizeByDataset(subjects);

  console.log(`  Organized into ${Object.keys(datasets).length} datasets:\n`);
  for (const [name, data] of Object.entries(datasets)) {
    console.log(`     ${name}: ${data.subjects.length} subjects`);
  }
  console.log();

  // Step 3: Import to database (interactive or non-interactive)
  let rl = null;
  try {
    if (!nonInteractive) {
      rl = createReadlineInterface();
      await importToDatabaseInteractive(datasets, rl);
    } else {
      await importToDatabase(datasets);
    }
  } finally {
    if (rl) {
      rl.close();
    }
  }

  // Disconnect SSH if used
  if (useSSH) {
    sshService.disconnect();
  }

  console.log('  All done!\n');
}

// Run the script
try {
  main().catch(error => {
    console.error('\n  Fatal error:', error.message);
    console.error(error.stack);
    if (useSSH) {
      sshService.disconnect();
    }
    process.exit(1);
  });
} catch (error) {
  console.error('\n  Fatal error:', error.message);
  console.error(error.stack);
  if (useSSH) {
    sshService.disconnect();
  }
  process.exit(1);
}
