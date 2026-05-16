/**
 * Find All Mismatched Filenames
 * 
 * Check all datasets for samples where the filename in the database
 * doesn't match actual files on disk. Creates a report of all mismatches.
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

console.log('🔍 Finding all mismatched filenames across all datasets...\n');

// Get all datasets
const datasets = db.prepare(`
  SELECT id, name, image_path, is_ssh
  FROM datasets
  ORDER BY name
`).all();

console.log(`Found ${datasets.length} datasets\n`);

// Get all samples
const allSamples = db.prepare(`
  SELECT s.id, s.filename, s.file_path, s.dataset_id, d.name as dataset_name, d.image_path, d.is_ssh
  FROM samples s
  JOIN datasets d ON s.dataset_id = d.id
  ORDER BY d.name, s.filename
`).all();

console.log(`Found ${allSamples.length} total samples\n`);

// Group samples by dataset
const samplesByDataset = {};
for (const sample of allSamples) {
  if (!samplesByDataset[sample.dataset_name]) {
    samplesByDataset[sample.dataset_name] = [];
  }
  samplesByDataset[sample.dataset_name].push(sample);
}

// Scan folders for files
console.log('📁 Scanning file system...\n');

const folderFiles = {};
const validFolders = ['BC', 'RG', 'MH', 'SP'];

// Scan BC, RG, MH, SP folders
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

// Also scan data/images for other datasets
const imagesFolders = {};
if (existsSync(imagesBaseDir)) {
  try {
    const entries = readdirSync(imagesBaseDir);
    for (const entry of entries) {
      const entryPath = join(imagesBaseDir, entry);
      if (statSync(entryPath).isDirectory()) {
        const files = readdirSync(entryPath)
          .filter(file => {
            const filePath = join(entryPath, file);
            try {
              return statSync(filePath).isFile() && file.toLowerCase().endsWith('.png');
            } catch {
              return false;
            }
          });
        imagesFolders[entry] = {
          files: files.map(f => f.toLowerCase()),
          actualFiles: files
        };
      }
    }
    console.log(`  data/images: ${Object.keys(imagesFolders).length} folders`);
  } catch (error) {
    console.warn(`  ⚠️  Error scanning data/images: ${error.message}`);
  }
}

console.log('');

// Find mismatches
const mismatches = [];
const notFound = [];

console.log('🔍 Checking samples...\n');

for (const datasetName of Object.keys(samplesByDataset)) {
  const samples = samplesByDataset[datasetName];
  let datasetMismatches = 0;
  let datasetNotFound = 0;

  for (const sample of samples) {
    const filenameLower = sample.filename.toLowerCase();
    let fileExists = false;
    let actualFilename = null;
    let foundPath = null;

    // Check if it's a QC dataset (BC, RG, MH, SP)
    if (validFolders.includes(datasetName)) {
      const folderData = folderFiles[datasetName];
      if (folderData) {
        const index = folderData.files.indexOf(filenameLower);
        if (index >= 0) {
          fileExists = true;
          actualFilename = folderData.actualFiles[index];
          foundPath = join(dataDir, datasetName, actualFilename);
        }
      }
    }

    // Check data/images folders
    if (!fileExists && imagesFolders[datasetName]) {
      const folderData = imagesFolders[datasetName];
      const index = folderData.files.indexOf(filenameLower);
      if (index >= 0) {
        fileExists = true;
        actualFilename = folderData.actualFiles[index];
        foundPath = join(imagesBaseDir, datasetName, actualFilename);
      }
    }

    // Check dataset image_path
    if (!fileExists && sample.image_path && !sample.is_ssh) {
      const datasetPath = join(projectRoot, sample.image_path);
      if (existsSync(datasetPath)) {
        try {
          const files = readdirSync(datasetPath)
            .filter(file => {
              const filePath = join(datasetPath, file);
              try {
                return statSync(filePath).isFile() && file.toLowerCase().endsWith('.png');
              } catch {
                return false;
              }
            });
          const index = files.map(f => f.toLowerCase()).indexOf(filenameLower);
          if (index >= 0) {
            fileExists = true;
            actualFilename = files[index];
            foundPath = join(datasetPath, actualFilename);
          }
        } catch (error) {
          // Skip if can't read
        }
      }
    }

    if (!fileExists) {
      // Try to find by subject ID
      const subjectMatch = sample.filename.match(/^(sub-[^_]+|sub-\d+|\d+)/i);
      if (subjectMatch) {
        const subjectId = subjectMatch[1].toLowerCase();
        let matchingFiles = [];

        // Search in QC folders
        if (validFolders.includes(datasetName) && folderFiles[datasetName]) {
          matchingFiles = folderFiles[datasetName].files.filter(f => f.includes(subjectId));
          if (matchingFiles.length > 0) {
            const actualFiles = folderFiles[datasetName].actualFiles.filter(f => 
              f.toLowerCase().includes(subjectId)
            );
            if (actualFiles.length > 0) {
              // Try to find best match
              const pattern = sample.filename.match(/(A1|A2|S1|S2|_T1w|_acq-|_run-)/gi);
              let bestMatch = null;
              
              if (pattern && actualFiles.length > 1) {
                for (const file of actualFiles) {
                  const fileLower = file.toLowerCase();
                  const filePattern = fileLower.match(/(a1|a2|s1|s2|_t1w|_acq-|_run-)/gi);
                  if (filePattern && filePattern.length >= pattern.length) {
                    bestMatch = file;
                    break;
                  }
                }
              }
              
              if (!bestMatch) {
                bestMatch = actualFiles[0];
              }
              
              mismatches.push({
                id: sample.id,
                dataset: datasetName,
                oldFilename: sample.filename,
                newFilename: bestMatch,
                oldFilePath: sample.file_path,
                reason: 'filename_mismatch',
                foundIn: `data/${datasetName}/`
              });
              datasetMismatches++;
              continue;
            }
          }
        }

        // Search in images folders
        if (imagesFolders[datasetName]) {
          matchingFiles = imagesFolders[datasetName].files.filter(f => f.includes(subjectId));
          if (matchingFiles.length > 0) {
            const actualFiles = imagesFolders[datasetName].actualFiles.filter(f => 
              f.toLowerCase().includes(subjectId)
            );
            if (actualFiles.length > 0) {
              mismatches.push({
                id: sample.id,
                dataset: datasetName,
                oldFilename: sample.filename,
                newFilename: actualFiles[0],
                oldFilePath: sample.file_path,
                reason: 'filename_mismatch',
                foundIn: `data/images/${datasetName}/`
              });
              datasetMismatches++;
              continue;
            }
          }
        }
      }

      // If we get here, file truly not found
      notFound.push({
        id: sample.id,
        dataset: datasetName,
        filename: sample.filename,
        file_path: sample.file_path
      });
      datasetNotFound++;
    }
  }

  if (datasetMismatches > 0 || datasetNotFound > 0) {
    console.log(`  ${datasetName}: ${datasetMismatches} mismatches, ${datasetNotFound} not found`);
  }
}

console.log('\n📊 Summary:');
console.log(`  Total mismatches: ${mismatches.length}`);
console.log(`  Total not found: ${notFound.length}\n`);

// Write report
const reportPath = join(projectRoot, 'mismatched-filenames-report.txt');
import fs from 'fs';
let report = 'MISMATCHED FILENAMES REPORT\n';
report += '='.repeat(80) + '\n\n';
report += `Generated: ${new Date().toISOString()}\n\n`;
report += `Total mismatches: ${mismatches.length}\n`;
report += `Total not found: ${notFound.length}\n\n`;

if (mismatches.length > 0) {
  report += 'MISMATCHES (filename in DB doesn\'t match file on disk):\n';
  report += '-'.repeat(80) + '\n\n';
  
  // Group by dataset
  const byDataset = {};
  for (const m of mismatches) {
    if (!byDataset[m.dataset]) {
      byDataset[m.dataset] = [];
    }
    byDataset[m.dataset].push(m);
  }

  for (const [dataset, items] of Object.entries(byDataset)) {
    report += `\nDataset: ${dataset} (${items.length} mismatches)\n`;
    report += '-'.repeat(80) + '\n';
    for (const m of items) {
      report += `Sample ID: ${m.id}\n`;
      report += `  Old filename: ${m.oldFilename}\n`;
      report += `  New filename: ${m.newFilename}\n`;
      report += `  Old file_path: ${m.oldFilePath || '(null)'}\n`;
      report += `  Found in: ${m.foundIn}\n`;
      report += '\n';
    }
  }
}

if (notFound.length > 0) {
  report += '\n\nNOT FOUND (file doesn\'t exist anywhere):\n';
  report += '-'.repeat(80) + '\n\n';
  
  // Group by dataset
  const byDataset = {};
  for (const nf of notFound) {
    if (!byDataset[nf.dataset]) {
      byDataset[nf.dataset] = [];
    }
    byDataset[nf.dataset].push(nf);
  }

  for (const [dataset, items] of Object.entries(byDataset)) {
    report += `\nDataset: ${dataset} (${items.length} not found)\n`;
    report += '-'.repeat(80) + '\n';
    for (const nf of items.slice(0, 50)) { // Limit to first 50 per dataset
      report += `Sample ID: ${nf.id}\n`;
      report += `  Filename: ${nf.filename}\n`;
      report += `  File path: ${nf.file_path || '(null)'}\n`;
      report += '\n';
    }
    if (items.length > 50) {
      report += `  ... and ${items.length - 50} more\n\n`;
    }
  }
}

fs.writeFileSync(reportPath, report, 'utf-8');

console.log(`✅ Report written to: ${reportPath}\n`);

// Show preview
console.log('Preview of mismatches:');
mismatches.slice(0, 10).forEach(m => {
  console.log(`  Sample ${m.id} (${m.dataset}):`);
  console.log(`    Old: ${m.oldFilename}`);
  console.log(`    New: ${m.newFilename}`);
});
if (mismatches.length > 10) {
  console.log(`  ... and ${mismatches.length - 10} more (see report file)`);
}

console.log('\n✅ Done!\n');

db.close();

