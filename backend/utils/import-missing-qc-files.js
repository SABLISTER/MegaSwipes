/**
 * Import Missing QC Files
 * 
 * This script imports PNG files from data/BC, data/RG, data/MH, data/SP
 * that are not yet in the database into their corresponding datasets.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { randomUUID } from 'crypto';

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

console.log('📥 Importing Missing QC Files...\n');
console.log(`Database: ${dbPath}`);
console.log(`Data directory: ${dataDir}\n`);

// Valid folders and their dataset names
const folderDatasetMap = {
  'BC': 'BC',
  'RG': 'RG',
  'MH': 'MH',
  'SP': 'SP'
};

// Get QC study
const qcStudy = db.prepare('SELECT id, name FROM studies WHERE name = ?').get('QC');

if (!qcStudy) {
  console.error('❌ QC study not found in database');
  db.close();
  process.exit(1);
}

console.log(`Found QC study: ${qcStudy.name} (ID: ${qcStudy.id})\n`);

// Get dataset IDs
const getDatasetStmt = db.prepare('SELECT id, name FROM datasets WHERE study_id = ? AND name = ?');
const datasetIds = {};

for (const [folder, datasetName] of Object.entries(folderDatasetMap)) {
  const dataset = getDatasetStmt.get(qcStudy.id, datasetName);
  if (!dataset) {
    console.error(`❌ Dataset '${datasetName}' not found`);
    db.close();
    process.exit(1);
  }
  datasetIds[folder] = dataset.id;
  console.log(`  ${folder} -> Dataset ID: ${dataset.id}`);
}

console.log('');

// Get existing samples (by filename, case-insensitive)
const existingSamples = db.prepare(`
  SELECT LOWER(filename) as filename_lower, dataset_id
  FROM samples
  WHERE dataset_id IN (${Object.values(datasetIds).join(',')})
`).all();

const existingFilenames = new Set(existingSamples.map(s => s.filename_lower));

console.log(`Found ${existingFilenames.size} existing samples in QC datasets\n`);

// Scan folders and import missing files
const insertSampleStmt = db.prepare(`
  INSERT INTO samples (dataset_id, filename, secure_token, file_path, created_at, updated_at)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

let totalImported = 0;
let totalSkipped = 0;

const importTransaction = db.transaction(() => {
  for (const [folder, datasetName] of Object.entries(folderDatasetMap)) {
    const folderPath = join(dataDir, folder);
    const datasetId = datasetIds[folder];

    if (!existsSync(folderPath)) {
      console.warn(`⚠️  Folder ${folder} does not exist`);
      continue;
    }

    console.log(`📁 Processing ${folder}...`);

    let folderImported = 0;
    let folderSkipped = 0;

    try {
      const files = readdirSync(folderPath)
        .filter(file => {
          const filePath = join(folderPath, file);
          return statSync(filePath).isFile() && file.toLowerCase().endsWith('.png');
        });

      for (const filename of files) {
        const filenameLower = filename.toLowerCase();

        if (existingFilenames.has(filenameLower)) {
          folderSkipped++;
          continue;
        }

        // Import this file
        const secureToken = randomUUID();
        const filePath = `${folder}/${filename}`;

        try {
          insertSampleStmt.run(datasetId, filename, secureToken, filePath);
          existingFilenames.add(filenameLower); // Add to set to avoid duplicates in same run
          folderImported++;
          totalImported++;
        } catch (error) {
          if (error.message.includes('UNIQUE constraint')) {
            folderSkipped++;
          } else {
            console.error(`  ❌ Error importing ${filename}:`, error.message);
          }
        }
      }

      console.log(`  ✅ Imported: ${folderImported}, Skipped: ${folderSkipped}`);
      totalSkipped += folderSkipped;
    } catch (error) {
      console.error(`  ❌ Error reading folder ${folder}:`, error.message);
    }
  }
});

importTransaction();

console.log('\n📊 Summary:');
console.log(`  ✅ Total imported: ${totalImported}`);
console.log(`  ⏭️  Total skipped: ${totalSkipped}\n`);

// Verify final counts
console.log('🔍 Verifying final counts...\n');

for (const [folder, datasetName] of Object.entries(folderDatasetMap)) {
  const folderPath = join(dataDir, folder);
  const datasetId = datasetIds[folder];

  if (!existsSync(folderPath)) continue;

  const filesInFolder = readdirSync(folderPath)
    .filter(file => {
      const filePath = join(folderPath, file);
      return statSync(filePath).isFile() && file.toLowerCase().endsWith('.png');
    }).length;

  const samplesInDataset = db.prepare(`
    SELECT COUNT(*) as count
    FROM samples
    WHERE dataset_id = ?
  `).get(datasetId).count;

  console.log(`  ${folder}:`);
  console.log(`    Files in folder: ${filesInFolder}`);
  console.log(`    Samples in dataset: ${samplesInDataset}`);

  if (filesInFolder === samplesInDataset) {
    console.log(`    ✅ Perfect match!`);
  } else {
    const diff = filesInFolder - samplesInDataset;
    if (diff > 0) {
      console.warn(`    ⚠️  ${diff} files not in database`);
    } else {
      console.warn(`    ⚠️  ${Math.abs(diff)} extra samples in database`);
    }
  }
}

console.log('\n✅ Done!\n');

db.close();

