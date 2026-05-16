import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const t1wCsvPath = path.join(projectRoot, 'data', 't1w_counts.csv');
const imagesDir = path.join(projectRoot, 'data', 'images');
const ignoreDir = path.join(projectRoot, 'data', 'ignore');
const ignoreImagesDir = path.join(ignoreDir, 'images');
const toDownloadCsvPath = path.join(ignoreDir, 't1w-to-download.csv');
const notInT1wCsvPath = path.join(ignoreDir, 'images-not-in-t1w.csv');

// Read t1w_counts.csv and extract all subject IDs with their data
function readT1wCsv() {
  const csvContent = fs.readFileSync(t1wCsvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  const header = lines[0];
  const data = {};
  
  // Parse header to get column indices
  const headers = header.split(',').map(h => h.trim());
  const subjectIdx = headers.indexOf('subject');
  const t1wCountIdx = headers.indexOf('t1w_count');
  const subjectPathIdx = headers.indexOf('subject_path');
  
  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split(',').map(c => c.trim());
    if (columns.length >= 3) {
      const subject = columns[subjectIdx];
      const t1wCount = columns[t1wCountIdx];
      const subjectPath = columns[subjectPathIdx];
      data[subject] = {
        subject,
        t1w_count: t1wCount,
        subject_path: subjectPath,
        fullLine: lines[i]
      };
    }
  }
  
  return { header, data };
}

// Recursively find all subject directories in images folder
function findAllSubjectDirectories(baseDir) {
  const found = new Map(); // Map<subjectId, fullPath>
  
  function searchDirectory(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        return;
      }
      
      const entries = fs.readdirSync(dirPath);
      
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        
        // Skip hidden files/folders
        if (entry.startsWith('.')) {
          continue;
        }
        
        try {
          const stats = fs.statSync(entryPath);
          
          if (stats.isDirectory()) {
            // Check if this is a subject directory (starts with "sub-")
            if (entry.startsWith('sub-')) {
              found.set(entry, entryPath);
            } else {
              // Recurse into subdirectories
              searchDirectory(entryPath);
            }
          }
        } catch (err) {
          // Skip entries we can't access
          continue;
        }
      }
    } catch (err) {
      // Skip directories we can't read
      return;
    }
  }
  
  searchDirectory(baseDir);
  return found;
}

// Copy directory recursively, preserving structure
function copyDirectory(src, dest) {
  // Create destination directory
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src);
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    
    try {
      const stats = fs.statSync(srcPath);
      
      if (stats.isDirectory()) {
        copyDirectory(srcPath, destPath);
      } else {
        // Copy file
        fs.copyFileSync(srcPath, destPath);
      }
    } catch (err) {
      console.warn(`     ⚠️  Could not copy ${srcPath}: ${err.message}`);
    }
  }
}

// Main function
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Syncing t1w_counts.csv with images directory');
  console.log('='.repeat(60) + '\n');
  
  // Read t1w_counts.csv
  console.log('Reading t1w_counts.csv...');
  const { header, data: t1wData } = readT1wCsv();
  const t1wSubjectIds = new Set(Object.keys(t1wData));
  console.log(`Found ${t1wSubjectIds.size} subjects in t1w_counts.csv\n`);
  
  // Find all subject directories in images
  console.log('Scanning images directory for subject folders...');
  const existingSubjects = findAllSubjectDirectories(imagesDir);
  console.log(`Found ${existingSubjects.size} subject directories in images folder\n`);
  
  // Create ignore directory if needed
  if (!fs.existsSync(ignoreImagesDir)) {
    fs.mkdirSync(ignoreImagesDir, { recursive: true });
  }
  
  // 1. Find IDs in t1w_counts.csv but NOT in images (need to download)
  const toDownload = [];
  for (const subjectId of t1wSubjectIds) {
    if (!existingSubjects.has(subjectId)) {
      toDownload.push(t1wData[subjectId].fullLine);
    }
  }
  
  // 2. Find IDs in images but NOT in t1w_counts.csv (move to ignore)
  const notInT1w = [];
  const toMoveToIgnore = [];
  
  for (const [subjectId, dirPath] of existingSubjects.entries()) {
    if (!t1wSubjectIds.has(subjectId)) {
      notInT1w.push({
        subject: subjectId,
        path: dirPath
      });
      toMoveToIgnore.push({ subjectId, dirPath });
    }
  }
  
  // Write to-download CSV
  if (toDownload.length > 0) {
    const toDownloadContent = header + '\n' + toDownload.join('\n') + '\n';
    fs.writeFileSync(toDownloadCsvPath, toDownloadContent, 'utf-8');
    console.log(`✓ Created to-download CSV: ${toDownload.length} subjects`);
    console.log(`  Location: ${toDownloadCsvPath}\n`);
  } else {
    console.log('✓ All subjects from t1w_counts.csv are already downloaded\n');
  }
  
  // Write not-in-t1w CSV
  if (notInT1w.length > 0) {
    const notInT1wContent = 'subject,image_path\n' + 
      notInT1w.map(item => `${item.subject},${item.path}`).join('\n') + '\n';
    fs.writeFileSync(notInT1wCsvPath, notInT1wContent, 'utf-8');
    console.log(`✓ Created not-in-t1w CSV: ${notInT1w.length} subjects`);
    console.log(`  Location: ${notInT1wCsvPath}\n`);
  }
  
  // Move directories to ignore
  if (toMoveToIgnore.length > 0) {
    console.log(`Moving ${toMoveToIgnore.length} subject directories to ignore folder...\n`);
    let movedCount = 0;
    
    for (const { subjectId, dirPath } of toMoveToIgnore) {
      // Calculate relative path from images directory
      const relativePath = path.relative(imagesDir, dirPath);
      const destPath = path.join(ignoreImagesDir, relativePath);
      
      console.log(`  Moving: ${subjectId}`);
      console.log(`    From: ${dirPath}`);
      console.log(`    To: ${destPath}`);
      
      try {
        // Create parent directory in ignore folder
        const destParent = path.dirname(destPath);
        if (!fs.existsSync(destParent)) {
          fs.mkdirSync(destParent, { recursive: true });
        }
        
        // Copy directory
        copyDirectory(dirPath, destPath);
        
        // Remove original directory
        fs.rmSync(dirPath, { recursive: true, force: true });
        
        movedCount++;
        console.log(`    ✓ Moved successfully\n`);
      } catch (err) {
        console.error(`    ✗ Error: ${err.message}\n`);
      }
    }
    
    console.log(`✓ Moved ${movedCount} directories to ignore folder\n`);
  } else {
    console.log('✓ No directories to move (all existing subjects are in t1w_counts.csv)\n');
  }
  
  // Print summary
  console.log('='.repeat(60));
  console.log('Summary:');
  console.log('='.repeat(60));
  console.log(`Subjects in t1w_counts.csv: ${t1wSubjectIds.size}`);
  console.log(`Subject directories in images: ${existingSubjects.size}`);
  console.log(`Subjects to download: ${toDownload.length}`);
  console.log(`Subjects not in t1w_counts.csv (moved to ignore): ${toMoveToIgnore.length}`);
  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

