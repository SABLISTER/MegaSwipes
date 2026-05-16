/**
 * Import Repeat Datasets for QC Study
 *
 * This script:
 * 1. Creates repeat datasets under a QC study
 * 2. Imports images from subfolders in data/images/
 * 3. Sets up per-user dataset access
 *
 * Configure userMappings below with your deployment's usernames and user IDs.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Database path
const dbPath = join(projectRoot, 'data', 'neuroqc.db');
const imagesBaseDir = join(projectRoot, 'data', 'images');
const sourceDir = join(imagesBaseDir, 'reswipe_duplicates_12-2-25');

if (!existsSync(dbPath)) {
  console.error(`❌ Database not found at: ${dbPath}`);
  process.exit(1);
}

if (!existsSync(sourceDir)) {
  console.error(`❌ Source directory not found at: ${sourceDir}`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

console.log('📥 Importing Repeat Datasets for QC Study...\n');
console.log(`Database: ${dbPath}`);
console.log(`Source directory: ${sourceDir}\n`);

// Get QC study
const qcStudy = db.prepare('SELECT id, name FROM studies WHERE name = ?').get('QC');

if (!qcStudy) {
  console.error('❌ QC study not found in database');
  db.close();
  process.exit(1);
}

console.log(`Found QC study: ${qcStudy.name} (ID: ${qcStudy.id})\n`);

// User mappings: username -> { userId, datasetName, folderName }
// Replace usernames and userId values with those from your deployment's database.
const userMappings = {
  'user1': {
    userId: 'user-id-from-your-database',
    datasetName: 'repeat_SP',
    folderName: 'SP'
  },
  'user2': {
    userId: 'user-id-from-your-database',
    datasetName: 'repeat_RG',
    folderName: 'RG'
  },
  'user3': {
    userId: 'user-id-from-your-database',
    datasetName: 'repeat_MH',
    folderName: 'MH'
  }
};

// Verify users exist
console.log('🔍 Verifying users...\n');
const getUserStmt = db.prepare('SELECT id, username FROM users WHERE id = ?');
for (const [username, mapping] of Object.entries(userMappings)) {
  const user = getUserStmt.get(mapping.userId);
  if (!user) {
    console.error(`❌ User ${username} (${mapping.userId}) not found in database`);
    db.close();
    process.exit(1);
  }
  console.log(`  ✓ ${username} (${user.username}) -> ${mapping.datasetName}`);
}
console.log('');

// Prepare statements
const getDatasetStmt = db.prepare('SELECT id, name FROM datasets WHERE study_id = ? AND name = ?');
const insertDatasetStmt = db.prepare(`
  INSERT INTO datasets (study_id, name, description, image_path, is_public, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);
const insertSampleStmt = db.prepare(`
  INSERT INTO samples (dataset_id, filename, secure_token, file_path, created_at, updated_at)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`);
const insertAccessStmt = db.prepare(`
  INSERT OR IGNORE INTO user_dataset_access (user_id, dataset_id, access_granted_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
`);

// Process each user/dataset
let totalImported = 0;
let totalSkipped = 0;

const importTransaction = db.transaction(() => {
  for (const [username, mapping] of Object.entries(userMappings)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing ${username} -> ${mapping.datasetName}`);
    console.log('='.repeat(60));
    
    const folderPath = join(sourceDir, mapping.folderName);
    
    if (!existsSync(folderPath)) {
      console.warn(`⚠️  Folder ${mapping.folderName} does not exist at ${folderPath}`);
      continue;
    }
    
    // Check if dataset already exists
    let dataset = getDatasetStmt.get(qcStudy.id, mapping.datasetName);
    
    if (!dataset) {
      // Create new dataset (private, not public)
      const description = `Repeat dataset for ${username} - QC study reswipe duplicates`;
      const result = insertDatasetStmt.run(
        qcStudy.id,
        mapping.datasetName,
        description,
        mapping.datasetName, // image_path
        0 // is_public = false (private)
      );
      dataset = { id: result.lastInsertRowid, name: mapping.datasetName };
      console.log(`  ✓ Created dataset: ${mapping.datasetName} (ID: ${dataset.id})`);
    } else {
      console.log(`  ℹ️  Dataset already exists: ${mapping.datasetName} (ID: ${dataset.id})`);
    }
    
    // Grant user access
    try {
      insertAccessStmt.run(mapping.userId, dataset.id);
      console.log(`  ✓ Granted access to ${username}`);
    } catch (error) {
      if (!error.message.includes('UNIQUE constraint')) {
        console.error(`  ❌ Error granting access: ${error.message}`);
      } else {
        console.log(`  ℹ️  Access already granted to ${username}`);
      }
    }
    
    // Get existing samples for this dataset
    const existingSamples = db.prepare(`
      SELECT LOWER(filename) as filename_lower
      FROM samples
      WHERE dataset_id = ?
    `).all(dataset.id);
    
    const existingFilenames = new Set(existingSamples.map(s => s.filename_lower));
    console.log(`  Found ${existingFilenames.size} existing samples in dataset\n`);
    
    // Scan folder and import images
    console.log(`  📁 Scanning ${mapping.folderName} folder...`);
    
    let folderImported = 0;
    let folderSkipped = 0;
    
    try {
      const files = readdirSync(folderPath)
        .filter(file => {
          const filePath = join(folderPath, file);
          return statSync(filePath).isFile() && file.toLowerCase().endsWith('.png');
        });
      
      console.log(`  Found ${files.length} PNG files\n`);
      
      for (const filename of files) {
        const filenameLower = filename.toLowerCase();
        
        if (existingFilenames.has(filenameLower)) {
          folderSkipped++;
          continue;
        }
        
        // Import this file
        const secureToken = randomUUID();
        // For QC datasets, file_path should point to where the files actually are
        // Files are in: data/images/reswipe_duplicates_12-2-25/{folder}/{filename}
        // The image serving code will try data/images/{file_path} as a fallback, which will work
        const filePath = `reswipe_duplicates_12-2-25/${mapping.folderName}/${filename}`;
        
        try {
          insertSampleStmt.run(dataset.id, filename, secureToken, filePath);
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
      console.error(`  ❌ Error reading folder ${mapping.folderName}:`, error.message);
    }
  }
});

importTransaction();

console.log('\n' + '='.repeat(60));
console.log('📊 Summary:');
console.log('='.repeat(60));
console.log(`  ✅ Total imported: ${totalImported}`);
console.log(`  ⏭️  Total skipped: ${totalSkipped}\n`);

// Verify final counts
console.log('🔍 Verifying final counts...\n');

for (const [username, mapping] of Object.entries(userMappings)) {
  const folderPath = join(sourceDir, mapping.folderName);
  const dataset = getDatasetStmt.get(qcStudy.id, mapping.datasetName);
  
  if (!dataset) {
    console.warn(`  ⚠️  Dataset ${mapping.datasetName} not found`);
    continue;
  }
  
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
  `).get(dataset.id).count;
  
  // Check user access
  const hasAccess = db.prepare(`
    SELECT COUNT(*) as count
    FROM user_dataset_access
    WHERE user_id = ? AND dataset_id = ?
  `).get(mapping.userId, dataset.id).count > 0;
  
  console.log(`  ${mapping.datasetName} (${username}):`);
  console.log(`    Files in folder: ${filesInFolder}`);
  console.log(`    Samples in dataset: ${samplesInDataset}`);
  console.log(`    User access: ${hasAccess ? '✓ Granted' : '✗ Not granted'}`);
  
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
  console.log('');
}

console.log('✅ Done!\n');

db.close();

