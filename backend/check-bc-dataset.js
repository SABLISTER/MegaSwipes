/**
 * Check BC Dataset
 * 
 * Compare files in data/BC folder with samples in database
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

console.log('🔍 Checking BC Dataset...\n');

// Get BC dataset
const bcDataset = db.prepare('SELECT id, name FROM datasets WHERE name = ?').get('BC');

if (!bcDataset) {
  console.error('❌ BC dataset not found');
  db.close();
  process.exit(1);
}

// Get samples in BC dataset
const bcSamples = db.prepare(`
  SELECT filename
  FROM samples
  WHERE dataset_id = ?
`).all(bcDataset.id);

console.log(`Samples in BC dataset: ${bcSamples.length}`);

// Get files in BC folder
const bcFolderPath = join(dataDir, 'BC');
if (!existsSync(bcFolderPath)) {
  console.error(`❌ BC folder not found at: ${bcFolderPath}`);
  db.close();
  process.exit(1);
}

const files = readdirSync(bcFolderPath)
  .filter(file => {
    const filePath = join(bcFolderPath, file);
    try {
      return statSync(filePath).isFile() && file.toLowerCase().endsWith('.png');
    } catch {
      return false;
    }
  });

console.log(`Files in data/BC folder: ${files.length}\n`);

// Find missing files
const sampleFilenames = new Set(bcSamples.map(s => s.filename.toLowerCase()));
const missingFiles = files.filter(f => !sampleFilenames.has(f.toLowerCase()));

console.log(`Missing files (not in database): ${missingFiles.length}\n`);

if (missingFiles.length > 0) {
  console.log('First 20 missing files:');
  missingFiles.slice(0, 20).forEach(f => console.log(`  - ${f}`));
  if (missingFiles.length > 20) {
    console.log(`  ... and ${missingFiles.length - 20} more`);
  }
}

db.close();


