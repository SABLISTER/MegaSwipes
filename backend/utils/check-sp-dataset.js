/**
 * Check SP Dataset
 * 
 * Investigate why SP dataset only has 4 samples when there are 728 files
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const dbPath = join(projectRoot, 'data', 'neuroqc.db');
const dataDir = join(projectRoot, 'data');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

console.log('🔍 Checking SP Dataset...\n');

// Get SP dataset
const spDataset = db.prepare('SELECT id, name FROM datasets WHERE name = ?').get('SP');

if (!spDataset) {
  console.error('❌ SP dataset not found');
  db.close();
  process.exit(1);
}

console.log(`SP Dataset: ID ${spDataset.id}\n`);

// Get all samples in SP dataset
const spSamples = db.prepare(`
  SELECT id, filename, file_path, created_at
  FROM samples
  WHERE dataset_id = ?
  ORDER BY id
`).all(spDataset.id);

console.log(`Samples in SP dataset: ${spSamples.length}`);
spSamples.forEach(s => {
  console.log(`  - ID ${s.id}: ${s.filename} (path: ${s.file_path})`);
});

console.log('\n');

// Check files in SP folder
const spFolderPath = join(dataDir, 'SP');
if (existsSync(spFolderPath)) {
  const files = readdirSync(spFolderPath)
    .filter(file => {
      const filePath = join(spFolderPath, file);
      return statSync(filePath).isFile() && file.toLowerCase().endsWith('.png');
    });

  console.log(`Files in data/SP folder: ${files.length}\n`);

  // Check which files are missing from database
  const sampleFilenames = new Set(spSamples.map(s => s.filename.toLowerCase()));
  const missingFiles = files.filter(f => !sampleFilenames.has(f.toLowerCase()));

  console.log(`Missing files (not in database): ${missingFiles.length}`);
  if (missingFiles.length > 0) {
    console.log('First 20 missing files:');
    missingFiles.slice(0, 20).forEach(f => console.log(`  - ${f}`));
    if (missingFiles.length > 20) {
      console.log(`  ... and ${missingFiles.length - 20} more`);
    }
  }
} else {
  console.log('❌ SP folder does not exist');
}

// Check if there are samples in other datasets that should be in SP
console.log('\n🔍 Checking other datasets for SP files...\n');

const allSamples = db.prepare(`
  SELECT s.id, s.filename, s.file_path, d.name as dataset_name
  FROM samples s
  JOIN datasets d ON s.dataset_id = d.id
  WHERE s.filename LIKE '%' OR s.file_path LIKE 'SP/%'
  ORDER BY d.name, s.filename
`).all();

const spFilesInOtherDatasets = allSamples.filter(s => {
  const filename = s.filename.toLowerCase();
  if (existsSync(spFolderPath)) {
    const files = readdirSync(spFolderPath)
      .filter(file => {
        const filePath = join(spFolderPath, file);
        return statSync(filePath).isFile() && file.toLowerCase().endsWith('.png');
      })
      .map(f => f.toLowerCase());
    
    return files.includes(filename) && s.dataset_name !== 'SP';
  }
  return false;
});

if (spFilesInOtherDatasets.length > 0) {
  console.log(`Found ${spFilesInOtherDatasets.length} SP files in other datasets:`);
  spFilesInOtherDatasets.slice(0, 20).forEach(s => {
    console.log(`  - ${s.filename} in dataset: ${s.dataset_name}`);
  });
  if (spFilesInOtherDatasets.length > 20) {
    console.log(`  ... and ${spFilesInOtherDatasets.length - 20} more`);
  }
} else {
  console.log('No SP files found in other datasets');
}

db.close();

