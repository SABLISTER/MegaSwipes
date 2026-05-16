import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const t1wCsvPath = path.join(projectRoot, 'data', 't1w_counts.csv');
const ignoreImagesDir = path.join(projectRoot, 'data', 'ignore', 'images');

// Read t1w_counts.csv and extract all subject IDs
function readT1wSubjectIds() {
  const csvContent = fs.readFileSync(t1wCsvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  const subjectIds = new Set();
  
  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split(',').map(c => c.trim());
    if (columns.length >= 1) {
      const subject = columns[0];
      if (subject) {
        subjectIds.add(subject);
      }
    }
  }
  
  return subjectIds;
}

// Recursively find all subject directories in ignore folder
function findAllSubjectDirectoriesInIgnore(baseDir) {
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

// Main function
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Checking if any t1w_counts.csv subjects are in ignore folder');
  console.log('='.repeat(60) + '\n');
  
  // Read t1w_counts.csv
  console.log('Reading t1w_counts.csv...');
  const t1wSubjectIds = readT1wSubjectIds();
  console.log(`Found ${t1wSubjectIds.size} subjects in t1w_counts.csv\n`);
  
  // Find all subject directories in ignore folder
  console.log('Scanning ignore/images directory...');
  const ignoreSubjects = findAllSubjectDirectoriesInIgnore(ignoreImagesDir);
  console.log(`Found ${ignoreSubjects.size} subject directories in ignore folder\n`);
  
  // Find intersection
  const inBoth = [];
  for (const [subjectId, dirPath] of ignoreSubjects.entries()) {
    if (t1wSubjectIds.has(subjectId)) {
      inBoth.push({ subjectId, dirPath });
    }
  }
  
  // Print results
  console.log('='.repeat(60));
  if (inBoth.length > 0) {
    console.log(`⚠️  WARNING: Found ${inBoth.length} subjects from t1w_counts.csv in ignore folder!`);
    console.log('='.repeat(60));
    console.log('\nThese subjects should NOT be in ignore (they are in t1w_counts.csv):\n');
    
    inBoth.forEach(({ subjectId, dirPath }) => {
      console.log(`  - ${subjectId}`);
      console.log(`    Location: ${dirPath}`);
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('Recommendation: Move these back to the images directory');
    console.log('='.repeat(60) + '\n');
  } else {
    console.log('✓ SAFE: No subjects from t1w_counts.csv found in ignore folder');
    console.log('='.repeat(60) + '\n');
  }
  
  return inBoth;
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

