/**
 * Import Missing SP Files
 * 
 * Import all PNG files from data/SP folder into the SP dataset
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const dbPath = join(projectRoot, 'data', 'neuroqc.db');
const dataDir = join(projectRoot, 'data');

if (!existsSync(dbPath)) {
  console.error(`❌ Database not found at: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

console.log('📥 Importing SP Files...\n');

// Get SP dataset
const spDataset = db.prepare('SELECT id, name FROM datasets WHERE name = ?').get('SP');

if (!spDataset) {
  console.error('❌ SP dataset not found');
  db.close();
  process.exit(1);
}

console.log(`SP Dataset: ID ${spDataset.id}\n`);

// Get existing samples in SP dataset
const existingSamples = db.prepare(`
  SELECT LOWER(filename) as filename_lower
  FROM samples
  WHERE dataset_id = ?
`).all(spDataset.id);

const existingFilenames = new Set(existingSamples.map(s => s.filename_lower));
console.log(`Existing samples in SP dataset: ${existingFilenames.size}\n`);

// Scan SP folder
const spFolderPath = join(dataDir, 'SP');
if (!existsSync(spFolderPath)) {
  console.error(`❌ SP folder not found at: ${spFolderPath}`);
  db.close();
  process.exit(1);
}

const files = readdirSync(spFolderPath)
  .filter(file => {
    const filePath = join(spFolderPath, file);
    return statSync(filePath).isFile() && file.toLowerCase().endsWith('.png');
  });

console.log(`Files in SP folder: ${files.length}\n`);

// Find missing files
const missingFiles = files.filter(f => !existingFilenames.has(f.toLowerCase()));
console.log(`Missing files (not in database): ${missingFiles.length}\n`);

if (missingFiles.length === 0) {
  console.log('✅ All files are already in the database!');
  db.close();
  process.exit(0);
}

// Import missing files
const insertSampleStmt = db.prepare(`
  INSERT INTO samples (dataset_id, filename, secure_token, file_path, created_at, updated_at)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);

let imported = 0;
let errors = 0;

const importTransaction = db.transaction(() => {
  for (const filename of missingFiles) {
    const secureToken = randomUUID();
    const filePath = `SP/${filename}`;

    try {
      insertSampleStmt.run(spDataset.id, filename, secureToken, filePath);
      imported++;
    } catch (error) {
      if (error.message.includes('UNIQUE constraint')) {
        // Already exists (case-insensitive check might have missed it)
        console.warn(`  ⚠️  Skipping ${filename} (already exists)`);
      } else {
        console.error(`  ❌ Error importing ${filename}:`, error.message);
        errors++;
      }
    }
  }
});

console.log('🔄 Importing files...\n');
importTransaction();

console.log('✅ Import complete!');
console.log(`  Imported: ${imported}`);
console.log(`  Errors: ${errors}\n`);

// Verify
const finalCount = db.prepare(`
  SELECT COUNT(*) as count
  FROM samples
  WHERE dataset_id = ?
`).get(spDataset.id).count;

console.log(`Final sample count in SP dataset: ${finalCount}`);
console.log(`Files in SP folder: ${files.length}`);

if (finalCount === files.length) {
  console.log('✅ Perfect match!');
} else {
  console.warn(`⚠️  Mismatch: ${files.length - finalCount} files not imported`);
}

db.close();

