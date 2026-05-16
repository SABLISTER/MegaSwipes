/**
 * Export Routes
 * 
 * Handles comprehensive data exports similar to 0_pull_vote_stats.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');
const scriptsDir = path.join(projectRoot, 'scripts');
const helpersDir = path.join(scriptsDir, 'helpers');

/**
 * Helper function to extract subject ID from filename
 */
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

/**
 * Helper function to check if filename or filepath contains HBN scan indicators
 */
function isHBNScan(filename, filePath) {
  if (!filename && !filePath) {
    return false;
  }

  const searchTerms = ['HCP', 'Vnav', 'Vnavnorm'];
  const combined = `${filename || ''} ${filePath || ''}`.toLowerCase();

  return searchTerms.some(term => combined.includes(term.toLowerCase()));
}

/**
 * Helper function to escape CSV values
 */
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

/**
 * Load helper files if available
 */
function loadHelperFiles() {
  const studySiteSubMap = new Map();
  const hbnFilenameMap = new Map();

  // Load study_site_sub.csv
  const studySiteSubPath = path.join(helpersDir, 'study_site_sub.csv');
  if (fs.existsSync(studySiteSubPath)) {
    try {
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
    } catch (error) {
      console.warn('Error loading study_site_sub.csv:', error.message);
    }
  }

  // Load hbn.txt
  const hbnPath = path.join(helpersDir, 'hbn.txt');
  if (fs.existsSync(hbnPath)) {
    try {
      const hbnContent = fs.readFileSync(hbnPath, 'utf-8');
      const hbnLines = hbnContent.split('\n').filter(line => line.trim() !== '');

      for (const line of hbnLines) {
        const trimmed = line.trim();
        // Only process lines that look like file paths (contain a file extension)
        if (trimmed.includes('/HBN/') && /\.(json|nii\.gz|nii|bval|bvec|tsv|tsv\.gz)$/i.test(trimmed)) {
          const parts = trimmed.split('/');
          const filename = parts[parts.length - 1];

          // Find the site (the part after /HBN/ and before /sub-)
          const hbnIndex = parts.findIndex(p => p === 'HBN');
          if (hbnIndex >= 0 && hbnIndex + 1 < parts.length) {
            const site = parts[hbnIndex + 1];
            if (site && filename) {
              hbnFilenameMap.set(filename, site);
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error loading hbn.txt:', error.message);
    }
  }

  return { studySiteSubMap, hbnFilenameMap };
}

/**
 * Register export routes
 * @param {Express} app - Express application instance
 * @param {Function} requireAuth - Authentication middleware
 * @param {Function} requireAdmin - Admin authentication middleware
 */
export function registerExportRoutes(app, requireAuth, requireAdmin) {
  /**
   * GET /api/admin/export/samples-votes
   * Export all samples and votes to CSV (similar to 0_pull_vote_stats.js)
   * Query params: dataset_id (optional) - filter by specific dataset
   */
  app.get('/api/admin/export/samples-votes', requireAuth, requireAdmin, (req, res) => {
    try {
      const { dataset_id } = req.query;

      // Load helper files
      const { studySiteSubMap, hbnFilenameMap } = loadHelperFiles();

      // Get datasets to export
      let datasets;
      if (dataset_id) {
        const datasetId = parseInt(dataset_id, 10);
        if (isNaN(datasetId)) {
          return res.status(400).json({ error: 'Invalid dataset_id' });
        }

        const dataset = db.prepare('SELECT id, name FROM datasets WHERE id = ?').get(datasetId);
        if (!dataset) {
          return res.status(404).json({ error: 'Dataset not found' });
        }

        datasets = [dataset];
      } else {
        datasets = db.prepare('SELECT id, name FROM datasets ORDER BY id').all();
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

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      let filename;
      if (dataset_id && datasets.length === 1) {
        const datasetName = datasets[0].name.replace(/[^a-zA-Z0-9_-]/g, '_');
        filename = `samples-votes-export-${datasetName}-${datasets[0].id}-${timestamp}.csv`;
      } else {
        filename = `samples-votes-export-all-${timestamp}.csv`;
      }

      // Set response headers for CSV download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

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

      res.write(header + '\n');

      // Process each dataset
      for (const dataset of datasets) {
        const rows = query.all(dataset.id);

        if (rows.length === 0) {
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

        // Process each sample and its votes
        for (const [sampleId, votes] of sampleVotes.entries()) {
          const firstRow = votes[0];
          const filename = firstRow.filename;
          const file_path = firstRow.file_path;
          const subject = extractSubjectId(filename) || '';
          const datasetName = firstRow.dataset_name;
          const collection = firstRow.study_name || datasetName;

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
          else if (isHBN) {
            csvStudy = 'HBN';
            // Keep csvSite from CSV if available, otherwise leave empty
          }

          // If no votes, write one row with empty vote fields
          if (votes.length === 0 || !votes[0].rater) {
            const csvRow = [
              datasetName,
              collection,
              subject,
              csvStudy,
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

            res.write(csvRow + '\n');
          } else {
            // Write one row per vote
            let voteNumber = 0;
            for (const vote of votes) {
              if (vote.rater) { // Only write rows with actual votes
                voteNumber++;

                const csvRow = [
                  datasetName,
                  collection,
                  subject,
                  csvStudy,
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

                res.write(csvRow + '\n');
              }
            }
          }
        }
      }

      res.end();
    } catch (error) {
      console.error('Export samples-votes error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to export data: ' + error.message });
      } else {
        res.end();
      }
    }
  });
}

