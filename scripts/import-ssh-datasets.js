#!/usr/bin/env node
/**
 * Import datasets from SSH server into local SQLite database
 * 
 * Usage:
 *   node scripts/import-ssh-datasets.js [dataset_name] [--full]
 * 
 * This script will:
 * 1. Connect to SSH server
 * 2. Scan datasets in /data4/asd_meganalysis/SI_test_MH/pulls_for_abide/
 * 3. Create/update datasets and samples in the database
 * 4. Generate secure tokens for each sample
 * 
 * Options:
 *   dataset_name  - Scan only specific dataset (e.g., ABIDE_I, HBN_RU)
 *   --full        - Perform full scan of all subjects (slower but complete)
 * 
 * Examples:
 *   node scripts/import-ssh-datasets.js                    # Quick scan all datasets
 *   node scripts/import-ssh-datasets.js HBN_RU --full      # Full scan of HBN_RU
 *   node scripts/import-ssh-datasets.js --full             # Full scan all datasets
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import sshService from '../backend/ssh-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const projectRoot = path.join(__dirname, '..');
const dbPath = path.join(projectRoot, 'data', 'neuroqc.db');

// Parse command line arguments
const args = process.argv.slice(2);
const specificDataset = args.find(arg => !arg.startsWith('--'));
const isFullScan = args.includes('--full');

/**
 * Get or create default study
 */
function getOrCreateStudy(db) {
  let study = db.prepare('SELECT id, name FROM studies WHERE name = ?')
    .get('CMI Brain Scan QC');
  
  if (!study) {
    console.log('📋 Creating default study...');
    const result = db.prepare(`
      INSERT INTO studies (name, description)
      VALUES (?, ?)
    `).run('CMI Brain Scan QC', 'Child Mind Institute neuroimaging quality control study');
    
    study = { id: result.lastInsertRowid, name: 'CMI Brain Scan QC' };
    console.log(`✅ Created study: ${study.name} (ID: ${study.id})\n`);
  } else {
    console.log(`✅ Using existing study: ${study.name} (ID: ${study.id})\n`);
  }
  
  return study;
}

/**
 * Get or create dataset
 */
function getOrCreateDataset(db, studyId, datasetInfo) {
  let dataset = db.prepare('SELECT id, name, ssh_path FROM datasets WHERE ssh_path = ?')
    .get(datasetInfo.name);
  
  if (!dataset) {
    console.log(`📁 Creating dataset: ${datasetInfo.name}`);
    
    const result = db.prepare(`
      INSERT INTO datasets (study_id, name, description, image_path, ssh_path, is_ssh, is_public)
      VALUES (?, ?, ?, ?, ?, 1, 1)
    `).run(
      studyId,
      datasetInfo.name,
      `SSH dataset: ${datasetInfo.name} with ${datasetInfo.subjectCount || 0} subjects`,
      datasetInfo.name, // image_path for compatibility
      datasetInfo.name, // ssh_path
    );
    
    dataset = { 
      id: result.lastInsertRowid, 
      name: datasetInfo.name,
      ssh_path: datasetInfo.name
    };
    
    console.log(`✅ Created dataset (ID: ${dataset.id})`);
  } else {
    console.log(`✅ Using existing dataset: ${dataset.name} (ID: ${dataset.id})`);
  }
  
  return dataset;
}

/**
 * Import samples for a dataset
 */
function importSamples(db, datasetId, samples) {
  console.log(`📸 Importing ${samples.length} samples...`);
  
  const insertSampleStmt = db.prepare(`
    INSERT OR IGNORE INTO samples (dataset_id, filename, secure_token, file_path, ssh_path)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const updateSampleStmt = db.prepare(`
    UPDATE samples 
    SET ssh_path = ?, file_path = ?, updated_at = CURRENT_TIMESTAMP
    WHERE dataset_id = ? AND filename = ?
  `);
  
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  
  const importTransaction = db.transaction((samples) => {
    for (const sample of samples) {
      const secureToken = randomUUID();
      const filename = sample.filename;
      const sshPath = sample.path; // e.g., "HBN_RU/sub-NDARXX/file.png"
      const filePath = sshPath; // Keep same for compatibility
      
      // Try insert first
      const insertResult = insertSampleStmt.run(
        datasetId,
        filename,
        secureToken,
        filePath,
        sshPath
      );
      
      if (insertResult.changes > 0) {
        imported++;
      } else {
        // Sample exists, update SSH path
        const updateResult = updateSampleStmt.run(
          sshPath,
          filePath,
          datasetId,
          filename
        );
        
        if (updateResult.changes > 0) {
          updated++;
        } else {
          skipped++;
        }
      }
    }
  });
  
  importTransaction(samples);

  console.log(`   ✅ Imported: ${imported}, Updated: ${updated}, Skipped: ${skipped}`);

  return { imported, updated, skipped };
}

/**
 * Quick scan - samples first few subjects per dataset
 */
async function quickScan(db, studyId) {
  console.log('🚀 Running QUICK SCAN (sampling first few subjects per dataset)\n');
  
  const datasetsInfo = await sshService.scanDatasets();
  
  let totalImported = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  
  for (const datasetInfo of datasetsInfo) {
    console.log(`\n📂 Processing: ${datasetInfo.name}`);
    console.log(`   Subjects: ${datasetInfo.subjectCount}`);
    console.log(`   Estimated images: ${datasetInfo.estimatedImageCount}`);
    
    // Create/get dataset
    const dataset = getOrCreateDataset(db, studyId, datasetInfo);
    
    // Import sampled images
    const stats = importSamples(db, dataset.id, datasetInfo.samples);
    totalImported += stats.imported;
    totalUpdated += stats.updated;
    totalSkipped += stats.skipped;
    
    console.log(`   ℹ️  Note: This is a sample. Use --full flag to import all images.`);
  }
  
  return { totalImported, totalUpdated, totalSkipped, datasetsProcessed: datasetsInfo.length };
}

/**
 * Full scan - scans all subjects in dataset(s)
 */
async function performFullScan(db, studyId, datasetName = null) {
  if (datasetName) {
    console.log(`🚀 Running FULL SCAN for dataset: ${datasetName}\n`);
  } else {
    console.log('🚀 Running FULL SCAN for ALL datasets\n');
  }
  
  let datasetsToScan = [];
  
  if (datasetName) {
    // Scan specific dataset
    datasetsToScan = [datasetName];
  } else {
    // Get all datasets from SSH
    const quickScanResults = await sshService.scanDatasets();
    datasetsToScan = quickScanResults.map(d => d.name);
  }
  
  let totalImported = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let datasetsProcessed = 0;
  
  for (const dsName of datasetsToScan) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📂 Processing: ${dsName}`);
    console.log('='.repeat(60));
    
    try {
      // Perform detailed scan
      const datasetInfo = await sshService.scanDatasetDetail(dsName);
      
      console.log(`   Subjects: ${datasetInfo.subjectCount}`);
      console.log(`   Images: ${datasetInfo.imageCount}`);
      
      // Create/get dataset
      const dataset = getOrCreateDataset(db, studyId, datasetInfo);
      
      // Import all images
      const stats = importSamples(db, dataset.id, datasetInfo.samples);
      totalImported += stats.imported;
      totalUpdated += stats.updated;
      totalSkipped += stats.skipped;
      
      datasetsProcessed++;
    } catch (error) {
      console.error(`   ❌ Error processing ${dsName}:`, error.message);
    }
  }
  
  return { totalImported, totalUpdated, totalSkipped, datasetsProcessed };
}

/**
 * Main function
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🧠 CMI NeuroQC - SSH Dataset Import Tool');
  console.log('='.repeat(60) + '\n');
  
  // Check database
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Error: Database ${dbPath} does not exist`);
    console.error('Please run: node backend/init-database.js');
    process.exit(1);
  }
  
  // Connect to database
  console.log('🗄️  Connecting to database...');
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  console.log(`✅ Connected to ${dbPath}\n`);
  
  // Test SSH connection
  console.log('🔐 Testing SSH connection...');
  const testResult = await sshService.testConnection();
  
  if (!testResult.success) {
    console.error(`❌ SSH connection failed: ${testResult.message}`);
    console.error('\nPlease check your .env file and ensure SSH credentials are configured:');
    console.error('  SSH_HOST=your-server-hostname');
    console.error('  SSH_USERNAME=your-username');
    console.error('  SSH_KEY_PATH=/path/to/private/key');
    console.error('  SSH_BASE_PATH=/path/to/your/data');
    process.exit(1);
  }
  
  console.log(`✅ ${testResult.message}`);
  console.log(`   Base path: ${testResult.basePath}\n`);
  
  // Get or create study
  const study = getOrCreateStudy(db);
  
  // Run scan
  let results;
  const startTime = Date.now();
  
  try {
    if (isFullScan) {
      results = await performFullScan(db, study.id, specificDataset);
    } else {
      if (specificDataset) {
        console.log(`⚠️  Specific dataset provided but --full flag not set.`);
        console.log(`   Running full scan for: ${specificDataset}\n`);
        results = await performFullScan(db, study.id, specificDataset);
      } else {
        results = await quickScan(db, study.id);
      }
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Disconnect SSH
    sshService.disconnect();
    db.close();
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Import Summary:');
  console.log('='.repeat(60));
  console.log(`   Datasets processed: ${results.datasetsProcessed}`);
  console.log(`   Samples imported: ${results.totalImported}`);
  console.log(`   Samples updated: ${results.totalUpdated}`);
  console.log(`   Samples skipped: ${results.totalSkipped}`);
  console.log(`   Duration: ${duration}s`);
  console.log('='.repeat(60) + '\n');
  
  if (!isFullScan && !specificDataset) {
    console.log('💡 Tip: Use --full flag to import all images from all datasets');
    console.log('   Example: node scripts/import-ssh-datasets.js --full\n');
  }
  
  console.log('✅ Import complete!\n');
}

// Run the script
main().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
