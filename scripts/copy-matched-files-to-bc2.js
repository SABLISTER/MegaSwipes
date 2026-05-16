#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const abideDir = path.join(__dirname, '..', 'backup_donottouch', 'sort_export', 'ABIDE');
const hbnDir = path.join(__dirname, '..', 'backup_donottouch', 'sort_export', 'HBN');
const destDir = path.join(__dirname, '..', 'data', 'BC_2');

console.log('='.repeat(60));
console.log('Copying All Files to BC_2');
console.log('='.repeat(60));
console.log();

// Ensure destination directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  console.log(`✓ Created destination directory: ${destDir}\n`);
}

// Helper function to recursively find PNG files
function findPNGFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      try {
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          files.push(...findPNGFiles(itemPath));
        } else if (item.toLowerCase().endsWith('.png')) {
          files.push(itemPath);
        }
      } catch (err) {
        // Skip files/directories we can't access
        continue;
      }
    }
  } catch (err) {
    console.warn(`⚠️  Error reading directory ${dir}: ${err.message}`);
  }
  
  return files;
}

// Find all PNG files in source directories
console.log('Scanning source directories...');
const abideFiles = findPNGFiles(abideDir);
const hbnFiles = findPNGFiles(hbnDir);

console.log(`  ABIDE: ${abideFiles.length} PNG files`);
console.log(`  HBN: ${hbnFiles.length} PNG files`);
console.log(`  Total: ${abideFiles.length + hbnFiles.length} PNG files\n`);

// Prepare all files for copying
const allFiles = [];
for (const filePath of abideFiles) {
  allFiles.push({ source: filePath, sourceType: 'ABIDE' });
}
for (const filePath of hbnFiles) {
  allFiles.push({ source: filePath, sourceType: 'HBN' });
}

console.log(`✓ Preparing to copy ${allFiles.length} files\n`);

// Copy files
console.log('Copying files...');
let copied = 0;
let skipped = 0;
let errors = 0;
const copiedCounts = { abide: 0, hbn: 0 };

for (const { source, sourceType } of allFiles) {
  const filename = path.basename(source);
  const destPath = path.join(destDir, filename);
  
  // Check if file already exists
  if (fs.existsSync(destPath)) {
    skipped++;
    continue;
  }
  
  try {
    fs.copyFileSync(source, destPath);
    copied++;
    copiedCounts[sourceType.toLowerCase()]++;
  } catch (error) {
    console.error(`  ✗ Error copying ${filename}: ${error.message}`);
    errors++;
  }
}

console.log('\n' + '='.repeat(60));
console.log('Copy Summary');
console.log('='.repeat(60));
console.log(`Total files found: ${allFiles.length}`);
console.log(`Files copied: ${copied}`);
console.log(`  ABIDE: ${copiedCounts.abide}`);
console.log(`  HBN: ${copiedCounts.hbn}`);
if (skipped > 0) {
  console.log(`Files skipped (already exist): ${skipped}`);
}
if (errors > 0) {
  console.log(`Errors: ${errors}`);
}
console.log(`Destination: ${destDir}`);
console.log('='.repeat(60));
console.log('\n✓ Copy operation complete.\n');

