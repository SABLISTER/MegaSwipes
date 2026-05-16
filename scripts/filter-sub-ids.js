import fs from 'fs';
import path from 'path';

const csvPath = '/home/mhouse/MegaSwipes/data/imagestopullcsv.csv';
const ignoreDir = '/home/mhouse/MegaSwipes/data/ignore';
const ignoredCsvPath = path.join(ignoreDir, 'imagestopullcsv-sub-ids.csv');
const cleanedCsvPath = '/home/mhouse/MegaSwipes/data/imagestopullcsv-cleaned.csv';

// Read the CSV file
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.split('\n');

// Parse CSV and separate rows
const header = lines[0];
const dataLines = lines.slice(1).filter(line => line.trim() !== '');

let subIdCount = 0;
const subIdRows = [];
const regularIdRows = [];

// Process each data line
for (const line of dataLines) {
  // Split by comma, but handle CSV properly (simple split for now)
  const columns = line.split(',');
  if (columns.length >= 2) {
    const id = columns[1].trim();
    
    // Check if ID starts with "sub-"
    if (id.startsWith('sub-')) {
      subIdCount++;
      subIdRows.push(line);
    } else {
      regularIdRows.push(line);
    }
  }
}

// Create ignore directory if it doesn't exist
if (!fs.existsSync(ignoreDir)) {
  fs.mkdirSync(ignoreDir, { recursive: true });
  console.log(`Created ignore directory: ${ignoreDir}`);
}

// Write ignored rows to ignore directory
const ignoredContent = header + '\n' + subIdRows.join('\n') + '\n';
fs.writeFileSync(ignoredCsvPath, ignoredContent, 'utf-8');

// Write cleaned rows (without sub- IDs) to a new file
const cleanedContent = header + '\n' + regularIdRows.join('\n') + '\n';
fs.writeFileSync(cleanedCsvPath, cleanedContent, 'utf-8');

// Print results
console.log('\n' + '='.repeat(60));
console.log('Results:');
console.log('='.repeat(60));
console.log(`Total rows processed: ${dataLines.length}`);
console.log(`Rows with sub-<ID>: ${subIdCount}`);
console.log(`Rows with regular <ID>: ${regularIdRows.length}`);
console.log('\nFiles created:');
console.log(`  - Ignored rows: ${ignoredCsvPath}`);
console.log(`  - Cleaned rows: ${cleanedCsvPath}`);
console.log('='.repeat(60) + '\n');

