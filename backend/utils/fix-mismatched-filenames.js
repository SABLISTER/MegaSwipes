/**
 * Fix Mismatched Filenames
 * 
 * Update database with correct filenames from disk.
 * Non-destructive: only updates filename and file_path fields.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const dbPath = join(projectRoot, 'data', 'neuroqc.db');
const dataDir = join(projectRoot, 'data');
const imagesBaseDir = join(projectRoot, 'data', 'images');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

console.log('🔧 Fixing mismatched filenames in database...\n');

// Get all samples from BC, RG, MH, SP datasets
const samples = db.prepare(`
  SELECT s.id, s.filename, s.file_path, s.dataset_id, d.name as dataset_name
  FROM samples s
  JOIN datasets d ON s.dataset_id = d.id
  WHERE d.name IN ('BC', 'RG', 'MH', 'SP')
  ORDER BY d.name, s.filename
`).all();

console.log(`Found ${samples.length} samples to check\n`);

// Get all files in each folder
const folderFiles = {};
const validFolders = ['BC', 'RG', 'MH', 'SP'];

for (const folder of validFolders) {
  const folderPath = join(dataDir, folder);
  if (existsSync(folderPath)) {
    const files = readdirSync(folderPath)
      .filter(file => {
        const filePath = join(folderPath, file);
        try {
          return statSync(filePath).isFile() && file.toLowerCase().endsWith('.png');
        } catch {
          return false;
        }
      });
    folderFiles[folder] = {
      files: files.map(f => f.toLowerCase()),
      actualFiles: files // preserve case
    };
    console.log(`  ${folder}: ${files.length} files`);
  }
}

console.log('');

// Prepare update statement
const updateStmt = db.prepare(`
  UPDATE samples
  SET filename = ?, file_path = ?, updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`);

let checked = 0;
let fixed = 0;
let notFound = 0;
const fixes = [];

const fixTransaction = db.transaction(() => {
  for (const sample of samples) {
    checked++;
    if (checked % 100 === 0) {
      process.stdout.write(`\rChecked: ${checked}/${samples.length}...`);
    }

    const folder = sample.dataset_name;
    const folderData = folderFiles[folder];
    
    if (!folderData) {
      notFound++;
      continue;
    }

    const filenameLower = sample.filename.toLowerCase();
    
    // Check if exact filename exists (case-insensitive)
    const index = folderData.files.indexOf(filenameLower);
    if (index >= 0) {
      // File exists with correct name, no fix needed
      continue;
    }

    // Try to find a matching file by subject ID
    const subjectMatch = sample.filename.match(/^(sub-[^_]+|sub-\d+|\d+)/i);
    if (subjectMatch) {
      const subjectId = subjectMatch[1].toLowerCase();
      
      // Find all files for this subject
      const matchingFiles = folderData.actualFiles.filter(f => 
        f.toLowerCase().includes(subjectId)
      );
      
      if (matchingFiles.length > 0) {
        // Try to find the best match based on the original filename
        // Look for files with similar patterns (A1, A2, S1, S2, etc.)
        const pattern = sample.filename.match(/(A1|A2|S1|S2|_T1w|_acq-|_run-)/gi);
        let bestMatch = null;
        
        if (pattern && matchingFiles.length > 1) {
          // Try to find file with similar pattern
          for (const file of matchingFiles) {
            const fileLower = file.toLowerCase();
            const filePattern = fileLower.match(/(a1|a2|s1|s2|_t1w|_acq-|_run-)/gi);
            if (filePattern && filePattern.length >= pattern.length) {
              // Count how many pattern elements match
              let matchCount = 0;
              for (const p of pattern) {
                if (fileLower.includes(p.toLowerCase())) {
                  matchCount++;
                }
              }
              if (matchCount >= pattern.length * 0.7) { // 70% match threshold
                bestMatch = file;
                break;
              }
            }
          }
        }
        
        // If no pattern match, try to match by suffix (A1, A2, S1, S2)
        if (!bestMatch) {
          const suffixMatch = sample.filename.match(/(A1|A2|S1|S2)\.png$/i);
          if (suffixMatch) {
            const suffix = suffixMatch[1];
            for (const file of matchingFiles) {
              if (file.match(new RegExp(`${suffix}\\.png$`, 'i'))) {
                bestMatch = file;
                break;
              }
            }
          }
        }
        
        // If still no match, use the first one
        if (!bestMatch) {
          bestMatch = matchingFiles[0];
        }
        
        // Update database
        const newFilePath = `${folder}/${bestMatch}`;
        updateStmt.run(bestMatch, newFilePath, sample.id);
        
        fixes.push({
          id: sample.id,
          dataset: folder,
          oldFilename: sample.filename,
          newFilename: bestMatch
        });
        
        fixed++;
      } else {
        notFound++;
      }
    } else {
      notFound++;
    }
  }
});

console.log('🔄 Updating database...\n');
fixTransaction();

console.log(`\n\n📊 Results:`);
console.log(`  Checked: ${checked} samples`);
console.log(`  Fixed: ${fixed} mismatches`);
console.log(`  Not found: ${notFound} samples\n`);

if (fixes.length > 0) {
  console.log('Fixed mismatches (first 20):');
  fixes.slice(0, 20).forEach(f => {
    console.log(`  Sample ${f.id} (${f.dataset}):`);
    console.log(`    Old: ${f.oldFilename}`);
    console.log(`    New: ${f.newFilename}`);
  });
  if (fixes.length > 20) {
    console.log(`  ... and ${fixes.length - 20} more`);
  }
}

console.log('\n✅ Done!\n');

db.close();
