/**
 * Debug 404 Samples
 * 
 * Investigate why certain samples are returning 404 errors
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const dbPath = join(projectRoot, 'data', 'neuroqc.db');
const dataDir = join(projectRoot, 'data');
const imagesBaseDir = join(projectRoot, 'data', 'images');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

console.log('🔍 Debugging 404 Samples...\n');

// Sample IDs that are failing
const failingSampleIds = [84499, 84939, 84174, 85928];

// Get sample details
const getSampleStmt = db.prepare(`
  SELECT s.id, s.filename, s.file_path, s.secure_token, s.dataset_id, d.name as dataset_name, d.image_path as dataset_image_path
  FROM samples s
  JOIN datasets d ON s.dataset_id = d.id
  WHERE s.id = ?
`);

for (const sampleId of failingSampleIds) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Sample ID: ${sampleId}`);
  console.log('='.repeat(60));
  
  const sample = getSampleStmt.get(sampleId);
  
  if (!sample) {
    console.log('❌ Sample not found in database');
    continue;
  }
  
  console.log(`Filename: ${sample.filename}`);
  console.log(`File Path: ${sample.file_path || '(null)'}`);
  console.log(`Dataset: ${sample.dataset_name} (ID: ${sample.dataset_id})`);
  console.log(`Dataset Image Path: ${sample.dataset_image_path}`);
  console.log(`Secure Token: ${sample.secure_token}`);
  
  // Try to find the file
  console.log('\n🔍 Checking possible file locations...');
  
  const possiblePaths = [];
  
  // 1. Direct path from file_path
  if (sample.file_path) {
    // If file_path starts with folder name (BC/, RG/, etc.)
    if (sample.file_path.startsWith('BC/') || sample.file_path.startsWith('RG/') || 
        sample.file_path.startsWith('MH/') || sample.file_path.startsWith('SP/')) {
      const folder = sample.file_path.split('/')[0];
      const filename = sample.file_path.split('/').slice(1).join('/');
      possiblePaths.push(join(dataDir, folder, filename));
    } else {
      // Try as-is
      possiblePaths.push(join(dataDir, sample.file_path));
      possiblePaths.push(join(imagesBaseDir, sample.file_path));
    }
  }
  
  // 2. Try common folders
  const commonFolders = ['BC', 'MH', 'RG', 'SP'];
  for (const folder of commonFolders) {
    possiblePaths.push(join(dataDir, folder, sample.filename));
    possiblePaths.push(join(imagesBaseDir, folder, sample.filename));
    
    // Try with sub-* folder
    const subjectMatch = sample.filename.match(/^(sub-[^_]+|sub-\d+|\d+)/);
    if (subjectMatch) {
      const subjectId = subjectMatch[1];
      possiblePaths.push(join(imagesBaseDir, folder, subjectId, sample.filename));
    }
  }
  
  // 3. Try dataset image_path
  if (sample.dataset_image_path) {
    possiblePaths.push(join(projectRoot, sample.dataset_image_path, sample.filename));
    if (sample.file_path) {
      possiblePaths.push(join(projectRoot, sample.dataset_image_path, sample.file_path));
    }
  }
  
  let found = false;
  for (const path of possiblePaths) {
    if (existsSync(path)) {
      console.log(`✅ Found at: ${path}`);
      found = true;
      break;
    }
  }
  
  if (!found) {
    console.log('❌ File not found in any of these locations:');
    possiblePaths.slice(0, 10).forEach(p => console.log(`   - ${p}`));
    if (possiblePaths.length > 10) {
      console.log(`   ... and ${possiblePaths.length - 10} more`);
    }
  }
}

db.close();

