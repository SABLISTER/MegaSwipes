/**
 * Import Missing BC Files
 * 
 * Import all PNG files from data/BC folder that aren't in the database
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

console.log('📥 Importing Missing BC Files...\n');

// Get BC dataset
const bcDataset = db.prepare('SELECT id, name FROM datasets WHERE name = ?').get('BC');

if (!bcDataset) {
  console.error('❌ BC dataset not found');
  db.close();
  process.exit(1);
}

console.log(`BC Dataset: ID ${bcDataset.id}\n`);

// Get existing samples in BC dataset
const existingSamples = db.prepare(`
  SELECT LOWER(filename) as filename_lower
  FROM samples
  WHERE dataset_id = ?
`).all(bcDataset.id);

const existingFilenames = new Set(existingSamples.map(s => s.filename_lower));
console.log(`Existing samples in BC dataset: ${existingFilenames.size}\n`);

// Scan BC folder
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

console.log(`Files in BC folder: ${files.length}\n`);

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
    const filePath = `BC/${filename}`;

    try {
      insertSampleStmt.run(bcDataset.id, filename, secureToken, filePath);
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
`).get(bcDataset.id).count;

console.log(`Final sample count in BC dataset: ${finalCount}`);
console.log(`Files in BC folder: ${files.length}`);

if (finalCount === files.length) {
  console.log('✅ Perfect match!');
} else {
  console.warn(`⚠️  Mismatch: ${files.length - finalCount} files not imported`);
}

db.close();


