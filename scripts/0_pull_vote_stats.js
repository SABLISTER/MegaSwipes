#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path - go to project root
const projectRoot = join(__dirname, '..');
const dbPath = join(projectRoot, 'data', 'neuroqc.db');

if (!fs.existsSync(dbPath)) {
  console.error(`Error: Database not found at ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

console.log('='.repeat(60));
console.log('Export Samples and Votes to CSV');
console.log('='.repeat(60));
console.log(`Database: ${dbPath}\n`);

// Load study_site_sub.csv for cross-checking
const studySiteSubPath = join(__dirname, '/helpers/study_site_sub.csv');
let studySiteSubMap = new Map();

if (fs.existsSync(studySiteSubPath)) {
  console.log(`Loading study/site/subject mapping from: ${studySiteSubPath}`);
  const csvContent = fs.readFileSync(studySiteSubPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');

  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split(',').map(col => col.trim()).filter(col => col !== '');
    if (columns.length >= 3) {
      const study = columns[0];
      const site = columns[1];
      const subject = columns[2];

      if (subject) {
        studySiteSubMap.set(subject, { study, site });
      }
    }
  }
  console.log(`Loaded ${studySiteSubMap.size} subject mappings\n`);
} else {
  console.log(`Warning: study_site_sub.csv not found at ${studySiteSubPath}`);
  console.log('Continuing without cross-checking study/site information\n');
}

// Load hbn.txt for filename-to-site mapping
const hbnPath = join(__dirname, '/helpers/hbn.txt');
let hbnFilenameMap = new Map(); // Maps filename -> site

if (fs.existsSync(hbnPath)) {
  console.log(`Loading HBN filename mapping from: ${hbnPath}`);
  const hbnContent = fs.readFileSync(hbnPath, 'utf-8');
  const hbnLines = hbnContent.split('\n').filter(line => line.trim() !== '');

  let hbnCount = 0;
  for (const line of hbnLines) {
    const trimmed = line.trim();
    // Only process lines that look like file paths (contain a file extension)
    // Pattern: /data4/asd_meganalysis/7_Release/HBN/{SITE}/sub-{SUBJECT}/.../{FILENAME}
    if (trimmed.includes('/HBN/') && /\.(json|nii\.gz|nii|bval|bvec|tsv|tsv\.gz)$/i.test(trimmed)) {
      const parts = trimmed.split('/');
      const filename = parts[parts.length - 1]; // Last part is the filename

      // Find the site (the part after /HBN/ and before /sub-)
      const hbnIndex = parts.findIndex(p => p === 'HBN');
      if (hbnIndex >= 0 && hbnIndex + 1 < parts.length) {
        const site = parts[hbnIndex + 1];
        if (site && filename) {
          hbnFilenameMap.set(filename, site);
          hbnCount++;
        }
      }
    }
  }
  console.log(`Loaded ${hbnCount} HBN filename mappings\n`);
} else {
  console.log(`Warning: hbn.txt not found at ${hbnPath}`);
  console.log('Continuing without HBN filename mapping\n');
}

// Helper function to extract subject ID from filename
// Extract everything before the first underscore
function extractSubjectId(filename) {
  if (!filename) {
    return null;
  }

  // Extract everything before the first underscore
  const underscoreIndex = filename.indexOf('_');
  if (underscoreIndex > 0) {
    return filename.substring(0, underscoreIndex);
  }

  // If no underscore, return the entire filename (without extension)
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex > 0) {
    return filename.substring(0, dotIndex);
  }

  return filename;
}

// Helper function to check if filename or filepath contains HBN scan indicators
function isHBNScan(filename, filePath) {
  if (!filename && !filePath) {
    return false;
  }

  const searchTerms = ['HCP', 'Vnav', 'Vnavnorm'];
  const combined = `${filename || ''} ${filePath || ''}`.toLowerCase();

  return searchTerms.some(term => combined.includes(term.toLowerCase()));
}

// Helper function to escape CSV values
function escapeCSV(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Parse command line arguments
const args = process.argv.slice(2);
const listDatasets = args.includes('--list') || args.includes('-l');
const datasetIdArg = args.find(arg => arg.startsWith('--dataset-id='))?.split('=')[1] ||
  (args[0] && !args[0].startsWith('--') && !listDatasets ? args[0] : null);

// If --list flag, show datasets and exit
if (listDatasets) {
  console.log('='.repeat(60));
  console.log('Available Datasets for Export');
  console.log('='.repeat(60));
  console.log();

  const allDatasets = db.prepare(`
    SELECT 
      d.id,
      d.name,
      st.name as study_name,
      (SELECT COUNT(*) FROM samples WHERE dataset_id = d.id) as sample_count,
      (SELECT COUNT(*) FROM votes v 
       JOIN samples s ON v.sample_id = s.id 
       WHERE s.dataset_id = d.id) as vote_count,
      d.is_public
    FROM datasets d
    LEFT JOIN studies st ON d.study_id = st.id
    ORDER BY d.id
  `).all();

  if (allDatasets.length === 0) {
    console.log('No datasets found in database.');
  } else {
    console.log('ID    | Dataset Name                    | Study          | Samples | Votes | Public');
    console.log('-'.repeat(80));

    for (const ds of allDatasets) {
      const id = String(ds.id).padEnd(5);
      const name = (ds.name || '').substring(0, 30).padEnd(30);
      const study = (ds.study_name || 'N/A').substring(0, 14).padEnd(14);
      const samples = String(ds.sample_count || 0).padStart(7);
      const votes = String(ds.vote_count || 0).padStart(5);
      const isPublic = ds.is_public ? 'Yes' : 'No';

      console.log(`${id} | ${name} | ${study} | ${samples} | ${votes} | ${isPublic}`);
    }

    console.log('-'.repeat(80));
    console.log(`\nTotal: ${allDatasets.length} datasets`);
    console.log('\nUsage:');
    console.log('  Export all:    node export-samples-votes.js');
    console.log('  Export one:    node export-samples-votes.js --dataset-id=<id>');
    console.log('  List datasets: node export-samples-votes.js --list');
  }

  db.close();
  process.exit(0);
}

// Get datasets to export
let datasets;
if (datasetIdArg) {
  const datasetId = parseInt(datasetIdArg, 10);
  if (isNaN(datasetId)) {
    console.error(`Error: Invalid dataset ID: ${datasetIdArg}`);
    console.error('Usage: node export-samples-votes.js [--dataset-id=<id>] [--list]');
    db.close();
    process.exit(1);
  }

  const dataset = db.prepare('SELECT id, name FROM datasets WHERE id = ?').get(datasetId);
  if (!dataset) {
    console.error(`Error: Dataset with ID ${datasetId} not found`);
    console.error('Tip: Use --list to see all available datasets');
    db.close();
    process.exit(1);
  }

  datasets = [dataset];
  console.log(`Exporting single dataset: ${dataset.name} (ID: ${dataset.id})\n`);
} else {
  datasets = db.prepare('SELECT id, name FROM datasets ORDER BY id').all();
  console.log(`Found ${datasets.length} datasets (exporting all)\n`);
  console.log('Tip: Use --dataset-id=<id> to export a specific dataset');
  console.log('     Use --list to see all available datasets\n');
}

// Prepare the main query
const query = db.prepare(`
  SELECT 
    d.id AS dataset_id,
    d.name AS dataset_name,
    COALESCE(s.name, '') AS study_name,
    sm.id AS sample_id,
    sm.filename,
    sm.file_path,
    u.id AS user_id,
    u.username AS rater,
    v.rating AS rater_response,
    v.comment AS comment,
    v.created_at AS vote_date
  FROM samples sm
  INNER JOIN datasets d ON sm.dataset_id = d.id
  LEFT JOIN studies s ON d.study_id = s.id
  LEFT JOIN votes v ON sm.id = v.sample_id
  LEFT JOIN users u ON v.user_id = u.id
  WHERE sm.dataset_id = ?
  ORDER BY sm.id, v.created_at ASC
`);

// Generate timestamp for filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const outputDir = __dirname;

// Generate filename based on whether it's a single dataset or all datasets
let outputFile;
if (datasetIdArg && datasets.length === 1) {
  const datasetName = datasets[0].name.replace(/[^a-zA-Z0-9_-]/g, '_');
  outputFile = join(outputDir, `samples-votes-export-${datasetName}-${datasets[0].id}-${timestamp}.csv`);
} else {
  outputFile = join(outputDir, `samples-votes-export-all-${timestamp}.csv`);
}

// Open file for writing
const writeStream = fs.createWriteStream(outputFile, { encoding: 'utf8' });

// Write CSV header
const header = [
  'Dataset',
  'Collection',
  'Subject',
  'Study ',
  'Site ',
  'Filename',
  'File Path',
  'Rater',
  'Rater Response',
  'Comment',
  'Vote Number',
  'Is Extra Vote',
  'Vote Date'
].map(escapeCSV).join(',');

writeStream.write(header + '\n');

let totalRows = 0;
let totalSamples = 0;
let totalVotes = 0;
const datasetStats = [];

// Process each dataset
for (const dataset of datasets) {
  console.log(`Processing dataset: ${dataset.name} (ID: ${dataset.id})`);

  const rows = query.all(dataset.id);

  if (rows.length === 0) {
    console.log(`  No samples found\n`);
    continue;
  }

  // Group by sample_id to number votes
  const sampleVotes = new Map();

  for (const row of rows) {
    const sampleId = row.sample_id;
    if (!sampleVotes.has(sampleId)) {
      sampleVotes.set(sampleId, []);
    }
    sampleVotes.get(sampleId).push(row);
  }

  let datasetSamples = 0;
  let datasetVotes = 0;

  // Process each sample and its votes
  for (const [sampleId, votes] of sampleVotes.entries()) {
    const firstRow = votes[0];
    const filename = firstRow.filename;
    const file_path = firstRow.file_path;
    const subject = extractSubjectId(filename) || '';
    const datasetName = firstRow.dataset_name;
    const collection = firstRow.study_name || datasetName; // Fallback to dataset name if no study

    // Check if filename appears in hbn.txt (highest priority)
    const hbnSite = hbnFilenameMap.get(filename);

    // Check if this is an HBN scan (HCP, Vnav, or Vnavnorm in filename/filepath)
    const isHBN = isHBNScan(filename, file_path);

    // Look up study and site from CSV
    const csvInfo = studySiteSubMap.get(subject) || {};
    let csvStudy = csvInfo.study || '';
    let csvSite = csvInfo.site || '';

    // Priority 1: If filename is in hbn.txt, use HBN with the site from hbn.txt
    if (hbnSite) {
      csvStudy = 'HBN';
      csvSite = hbnSite;
    }
    // Priority 2: If scan indicators found (HCP/Vnav/Vnavnorm), override to HBN
    // This ensures HCP/Vnav/Vnavnorm scans are properly categorized as HBN
    // even if they're in NDA datasets with different scan types
    else if (isHBN) {
      csvStudy = 'HBN';
      // Keep csvSite from CSV if available, otherwise leave empty
    }

    datasetSamples++;

    // If no votes, write one row with empty vote fields
    if (votes.length === 0 || !votes[0].rater) {
      const csvRow = [
        datasetName,
        collection,
        subject,
        csvStudy, // Will be 'HBN' if isHBN is true, otherwise from CSV or empty
        csvSite,
        filename,
        file_path,
        '', // Rater
        '', // Rater Response
        '', // Comment
        '', // Vote Number
        '', // Is Extra Vote
        ''  // Vote Date
      ].map(escapeCSV).join(',');

      writeStream.write(csvRow + '\n');
      totalRows++;
    } else {
      // Write one row per vote
      let voteNumber = 0;
      for (const vote of votes) {
        if (vote.rater) { // Only write rows with actual votes
          voteNumber++;
          datasetVotes++;

          const csvRow = [
            datasetName,
            collection,
            subject,
            csvStudy, // Will be 'HBN' if isHBN is true, otherwise from CSV or empty
            csvSite,
            filename,
            file_path,
            vote.rater || '',
            vote.rater_response !== null ? vote.rater_response : '',
            vote.comment || '',
            voteNumber,
            voteNumber > 1 ? 'Y' : 'N',
            vote.vote_date || ''
          ].map(escapeCSV).join(',');

          writeStream.write(csvRow + '\n');
          totalRows++;
        }
      }
    }
  }

  totalSamples += datasetSamples;
  totalVotes += datasetVotes;
  datasetStats.push({
    name: dataset.name,
    samples: datasetSamples,
    votes: datasetVotes
  });

  console.log(`  Samples: ${datasetSamples}, Votes: ${datasetVotes}\n`);
}

writeStream.end();

console.log('='.repeat(60));
console.log('Export Summary');
console.log('='.repeat(60));
console.log(`Total datasets processed: ${datasets.length}`);
console.log(`Total samples: ${totalSamples}`);
console.log(`Total votes: ${totalVotes}`);
console.log(`Total CSV rows: ${totalRows}`);
console.log(`Output file: ${outputFile}`);
console.log('='.repeat(60));

// Show top datasets by vote count
if (datasetStats.length > 0) {
  console.log('\nTop datasets by vote count:');
  datasetStats
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 10)
    .forEach((stat, idx) => {
      console.log(`  ${idx + 1}. ${stat.name}: ${stat.votes} votes, ${stat.samples} samples`);
    });
}

console.log('\n✓ Export complete!');

db.close();

