import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const ignoreCsvPath = path.join(projectRoot, 'data', 'ignore', 'imagestopullcsv-sub-ids.csv');
const imagesDir = path.join(projectRoot, 'data', 'images');
const ignoreImagesDir = path.join(projectRoot, 'data', 'ignore', 'images');

// Read the ignore CSV to get all sub-IDs
function readSubIds() {
  const csvContent = fs.readFileSync(ignoreCsvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  const subIds = new Set();
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split(',');
    if (columns.length >= 2) {
      const id = columns[1].trim();
      if (id.startsWith('sub-')) {
        subIds.add(id);
      }
    }
  }
  
  return subIds;
}

// Recursively search for directories matching the sub-ID
function findSubIdDirectories(baseDir, subId) {
  const found = [];
  
  // Extract ID without "sub-" prefix for flexible matching
  const idWithoutPrefix = subId.replace(/^sub-/, '');
  const searchPatterns = [subId, idWithoutPrefix, subId.toLowerCase(), idWithoutPrefix.toLowerCase()];
  
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
            // Check if this directory matches any of the search patterns
            const matches = searchPatterns.some(pattern => 
              entry === pattern || 
              entry.toLowerCase() === pattern.toLowerCase() ||
              entry.includes(pattern) ||
              entry.toLowerCase().includes(pattern.toLowerCase())
            );
            
            if (matches) {
              found.push(entryPath);
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
  console.log('Moving sub-ID image directories to ignore folder');
  console.log('='.repeat(60) + '\n');
  
  // Read sub-IDs from CSV
  console.log('Reading sub-IDs from ignore CSV...');
  const subIds = readSubIds();
  console.log(`Found ${subIds.size} unique sub-IDs to process\n`);
  
  // Create ignore images directory
  if (!fs.existsSync(ignoreImagesDir)) {
    fs.mkdirSync(ignoreImagesDir, { recursive: true });
    console.log(`Created ignore images directory: ${ignoreImagesDir}\n`);
  }
  
  let foundCount = 0;
  let notFoundCount = 0;
  const notFoundIds = [];
  
  // Process each sub-ID
  for (const subId of subIds) {
    console.log(`Searching for ${subId}...`);
    
    // Find directories matching this sub-ID
    const directories = findSubIdDirectories(imagesDir, subId);
    
    if (directories.length === 0) {
      console.log(`  ❌ Not found: ${subId}`);
      notFoundCount++;
      notFoundIds.push(subId);
    } else {
      // Copy each found directory
      for (const dirPath of directories) {
        // Calculate relative path from images directory
        const relativePath = path.relative(imagesDir, dirPath);
        const destPath = path.join(ignoreImagesDir, relativePath);
        
        console.log(`  ✓ Found: ${dirPath}`);
        console.log(`    Copying to: ${destPath}`);
        
        try {
          copyDirectory(dirPath, destPath);
          foundCount++;
          console.log(`    ✓ Copied successfully\n`);
        } catch (err) {
          console.error(`    ✗ Error copying: ${err.message}\n`);
        }
      }
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary:');
  console.log('='.repeat(60));
  console.log(`Total sub-IDs processed: ${subIds.size}`);
  console.log(`Directories found and copied: ${foundCount}`);
  console.log(`Sub-IDs not found: ${notFoundCount}`);
  
  if (notFoundIds.length > 0) {
    console.log('\nSub-IDs not found in images directory:');
    notFoundIds.slice(0, 10).forEach(id => console.log(`  - ${id}`));
    if (notFoundIds.length > 10) {
      console.log(`  ... and ${notFoundIds.length - 10} more`);
    }
  }
  
  console.log(`\nIgnored images saved to: ${ignoreImagesDir}`);
  console.log('='.repeat(60) + '\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

