#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const excelFile = path.join(__dirname, 'S4S_sublist.xlsx');
const dataDir = path.join(__dirname, '..', 'data');
const targetFolders = ['MH', 'SP', 'BC', 'RG'];

// Read Excel file
console.log(`Reading Excel file: ${excelFile}`);
const workbook = XLSX.readFile(excelFile);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log(`Found ${data.length} rows in Excel file`);

// Create mapping: subject ID -> folder
// Excel structure:
// Row 0: [RG, , SP, , MH, , BC]
// Row 1: [collection, id, collection, id, collection, id, collection, id]
// Row 2+: [RG_col, RG_id, SP_col, SP_id, MH_col, MH_id, BC_col, BC_id]
// Columns: 0=RG_col, 1=RG_id, 2=SP_col, 3=SP_id, 4=MH_col, 5=MH_id, 6=BC_col, 7=BC_id
const mapping = new Map();

// Skip header rows (0 and 1)
for (let i = 2; i < data.length; i++) {
  const row = data[i];
  if (!row) continue;
  
  // RG: column 1
  if (row[1]) {
    const id = String(row[1]).trim();
    if (id) mapping.set(id.toLowerCase(), 'RG');
  }
  
  // SP: column 3
  if (row[3]) {
    const id = String(row[3]).trim();
    if (id) mapping.set(id.toLowerCase(), 'SP');
  }
  
  // MH: column 5
  if (row[5]) {
    const id = String(row[5]).trim();
    if (id) mapping.set(id.toLowerCase(), 'MH');
  }
  
  // BC: column 7
  if (row[7]) {
    const id = String(row[7]).trim();
    if (id) mapping.set(id.toLowerCase(), 'BC');
  }
}

console.log(`Created mapping for ${mapping.size} subject IDs`);

// Create target folders if they don't exist
for (const folder of targetFolders) {
  const folderPath = path.join(dataDir, folder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`Created folder: ${folderPath}`);
  }
}

// Recursively find all PNG files in data directory
function findPNGFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip target folders to avoid copying files we just copied
      if (!targetFolders.includes(file)) {
        findPNGFiles(filePath, fileList);
      }
    } else if (file.toLowerCase().endsWith('.png')) {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

console.log('Searching for PNG files in data/images directory...');
const imagesDir = path.join(dataDir, 'images');
const pngFiles = findPNGFiles(imagesDir);
console.log(`Found ${pngFiles.length} PNG files`);

// Helper function to extract subject ID from filename
function extractSubjectId(filename) {
  // Try to match patterns like:
  // - sub-NDARCT707VGJ
  // - sub-NDARCT707VGJ_T1w.png
  // - sub-NDARCT707VGJ_ses-1_run-1_T1w_S2.png
  // - 51126
  // - 51126_T1w.png
  
  // First try sub-* pattern - match sub- followed by alphanumeric (no underscores in the ID itself)
  // Stop at underscore, dash, or end of ID part
  const subMatch = filename.match(/sub-([A-Z0-9]+)(?=[^A-Z0-9]|$)/i);
  if (subMatch) {
    return `sub-${subMatch[1].toLowerCase()}`; // Return full "sub-xxxxx" in lowercase
  }
  
  // Try numeric ID at start of filename (before any underscore or dash)
  const numMatch = filename.match(/^(\d+)(?=[^0-9]|$)/);
  if (numMatch) {
    return numMatch[1];
  }
  
  // Try to find any numeric ID in filename (5+ digits)
  const anyNumMatch = filename.match(/(\d{5,})/);
  if (anyNumMatch) {
    return anyNumMatch[1];
  }
  
  return null;
}

// Build a map of subject IDs found in PNG files
// Key: subject ID (lowercase), Value: array of file paths
const foundSubjectIds = new Map();
for (const pngPath of pngFiles) {
  const filename = path.basename(pngPath);
  const subjectId = extractSubjectId(filename);
  
  if (subjectId) {
    const subjectIdLower = subjectId.toLowerCase();
    if (!foundSubjectIds.has(subjectIdLower)) {
      foundSubjectIds.set(subjectIdLower, []);
    }
    foundSubjectIds.get(subjectIdLower).push(pngPath);
  }
}

console.log(`Found ${foundSubjectIds.size} unique subject IDs in PNG files\n`);

// Check which subject IDs from Excel are NOT found in data/images
const notFoundInImages = [];
for (const [subjectId, folder] of mapping.entries()) {
  if (!foundSubjectIds.has(subjectId)) {
    notFoundInImages.push({ subjectId, folder });
  }
}

if (notFoundInImages.length > 0) {
  console.log(`\n⚠️  Subject IDs from Excel NOT found in data/images (${notFoundInImages.length}):`);
  console.log('='.repeat(60));
  
  // Group by folder
  const byFolder = { RG: [], SP: [], MH: [], BC: [] };
  for (const item of notFoundInImages) {
    byFolder[item.folder].push(item.subjectId);
  }
  
  for (const folder of ['RG', 'SP', 'MH', 'BC']) {
    if (byFolder[folder].length > 0) {
      console.log(`\n${folder} (${byFolder[folder].length} missing):`);
      // Show first 20, then summarize
      const toShow = byFolder[folder].slice(0, 20);
      toShow.forEach(id => console.log(`  - ${id}`));
      if (byFolder[folder].length > 20) {
        console.log(`  ... and ${byFolder[folder].length - 20} more`);
      }
    }
  }
} else {
  console.log('\n✓ All subject IDs from Excel were found in data/images!');
}

// Copy matching files
let copiedCount = 0;
let skippedCount = 0;
let notFoundInExcelCount = 0;

for (const pngPath of pngFiles) {
  const filename = path.basename(pngPath);
  const subjectId = extractSubjectId(filename);
  
  if (!subjectId) {
    notFoundInExcelCount++;
    continue;
  }
  
  const subjectIdLower = subjectId.toLowerCase();
  
  // Check if this subject ID matches any entry in the mapping
  if (mapping.has(subjectIdLower)) {
    const targetFolder = mapping.get(subjectIdLower);
    const targetDir = path.join(dataDir, targetFolder);
    const targetPath = path.join(targetDir, filename);
    
    // Check if file already exists in target
    if (fs.existsSync(targetPath)) {
      console.log(`⚠️  Already exists: ${targetPath}`);
      skippedCount++;
    } else {
      try {
        fs.copyFileSync(pngPath, targetPath);
        console.log(`✓ Copied: ${filename} → ${targetFolder}/${filename}`);
        copiedCount++;
      } catch (error) {
        console.error(`✗ Error copying ${pngPath}:`, error.message);
      }
    }
  } else {
    notFoundInExcelCount++;
  }
}

console.log('\n=== Copy Summary ===');
console.log(`Copied: ${copiedCount}`);
console.log(`Skipped (already exists): ${skippedCount}`);
console.log(`PNG files not in Excel mapping: ${notFoundInExcelCount}`);
console.log(`Subject IDs in Excel not found in images: ${notFoundInImages.length}`);
console.log(`Total PNG files processed: ${pngFiles.length}`);

// Now check target folders for files that shouldn't be there
console.log('\n' + '='.repeat(60));
console.log('Checking target folders for excluded files...');
console.log('='.repeat(60));

// Create excluded folder
const excludedDir = path.join(dataDir, 'excluded');
if (!fs.existsSync(excludedDir)) {
  fs.mkdirSync(excludedDir, { recursive: true });
  console.log(`Created excluded folder: ${excludedDir}`);
}

// Create reverse mapping: folder -> set of subject IDs that belong there
const folderSubjectIds = new Map();
for (const [subjectId, folder] of mapping.entries()) {
  if (!folderSubjectIds.has(folder)) {
    folderSubjectIds.set(folder, new Set());
  }
  folderSubjectIds.get(folder).add(subjectId);
}

let excludedCount = 0;
const excludedFiles = [];

// Check each target folder
for (const folder of targetFolders) {
  const folderPath = path.join(dataDir, folder);
  if (!fs.existsSync(folderPath)) {
    continue;
  }
  
  console.log(`\nChecking folder: ${folder}`);
  
  // Find all PNG files in this folder
  const folderPngFiles = findPNGFiles(folderPath);
  const expectedSubjectIds = folderSubjectIds.get(folder) || new Set();
  
  let folderExcluded = 0;
  
  for (const pngPath of folderPngFiles) {
    const filename = path.basename(pngPath);
    const subjectId = extractSubjectId(filename);
    
    if (!subjectId) {
      // Can't identify subject ID, exclude it
      const excludedSubDir = path.join(excludedDir, folder);
      if (!fs.existsSync(excludedSubDir)) {
        fs.mkdirSync(excludedSubDir, { recursive: true });
      }
      
      const excludedPath = path.join(excludedSubDir, filename);
      try {
        fs.renameSync(pngPath, excludedPath);
        console.log(`  ⚠️  Excluded (no subject ID): ${filename}`);
        excludedFiles.push({ filename, folder, reason: 'no subject ID' });
        folderExcluded++;
        excludedCount++;
      } catch (error) {
        console.error(`  ✗ Error moving ${filename}:`, error.message);
      }
      continue;
    }
    
    const subjectIdLower = subjectId.toLowerCase();
    
    // Check if this subject ID should be in this folder
    if (!expectedSubjectIds.has(subjectIdLower)) {
      // This file doesn't belong in this folder, move to excluded
      const excludedSubDir = path.join(excludedDir, folder);
      if (!fs.existsSync(excludedSubDir)) {
        fs.mkdirSync(excludedSubDir, { recursive: true });
      }
      
      const excludedPath = path.join(excludedSubDir, filename);
      try {
        fs.renameSync(pngPath, excludedPath);
        console.log(`  ⚠️  Excluded (not in list): ${filename} (subject: ${subjectId})`);
        excludedFiles.push({ filename, folder, reason: 'not in Excel list', subjectId });
        folderExcluded++;
        excludedCount++;
      } catch (error) {
        console.error(`  ✗ Error moving ${filename}:`, error.message);
      }
    }
  }
  
  if (folderExcluded === 0) {
    console.log(`  ✓ No excluded files found`);
  } else {
    console.log(`  ⚠️  Excluded ${folderExcluded} files`);
  }
}

console.log('\n' + '='.repeat(60));
console.log('Final Summary');
console.log('='.repeat(60));
console.log(`Copied: ${copiedCount}`);
console.log(`Skipped (already exists): ${skippedCount}`);
console.log(`Excluded (moved to data/excluded/): ${excludedCount}`);
console.log(`PNG files not in Excel mapping: ${notFoundInExcelCount}`);
console.log(`Subject IDs in Excel not found in images: ${notFoundInImages.length}`);
console.log(`Total PNG files processed: ${pngFiles.length}`);

if (excludedCount > 0) {
  console.log(`\n⚠️  ${excludedCount} files were moved to data/excluded/`);
  console.log('   These files were in the target folders but not in the Excel list.');
}

