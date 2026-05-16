/**
 * File Organizer Utility
 * 
 * Handles metadata extraction from filenames and organizes files into
 * the existing directory structure: study/dataset/site/subject/
 */

import path from 'path';
import fs from 'fs';
import db from '../database.js';

/**
 * Extract subject ID from filename
 * Patterns: sub-XXXXX, sub_XXXXX, or just numbers
 */
export function extractSubjectId(filename) {
  // Pattern 1: sub-XXXXX or sub_XXXXX
  const subPattern = /(?:^|[/\\])(sub[-_][a-zA-Z0-9]+)/i;
  const subMatch = filename.match(subPattern);
  if (subMatch) {
    return subMatch[1].replace(/_/g, '-'); // Normalize to sub- format
  }

  // Pattern 2: Extract from filename like "sub-28745_ses-1_run-1_T1w_A1.png"
  const filenamePattern = /^(sub-[^_]+|sub-\d+|\d+)/;
  const filenameMatch = filename.match(filenamePattern);
  if (filenameMatch) {
    return filenameMatch[1];
  }

  // Pattern 3: Look for any sub- pattern in the string
  const anySubPattern = /sub[-_][a-zA-Z0-9]+/i;
  const anyMatch = filename.match(anySubPattern);
  if (anyMatch) {
    return anyMatch[0].replace(/_/g, '-');
  }

  return null;
}

/**
 * Extract site from dataset name or filename
 * Examples: HBN_CUNY -> CUNY, HBN_CBIC -> CBIC
 */
export function extractSiteFromDataset(datasetName) {
  // Pattern: HBN_XXX -> site is XXX
  const hbnMatch = datasetName.match(/^HBN_(.+)$/);
  if (hbnMatch) {
    return hbnMatch[1];
  }

  // For other datasets, use "default" as site
  return 'default';
}

/**
 * Sanitize study name for filesystem use
 */
export function sanitizeStudyName(studyName) {
  return studyName
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Build file path structure: study/dataset/site/subject/filename
 */
export function buildFilePath(studyName, datasetName, site, subjectId, filename) {
  const sanitizedStudy = sanitizeStudyName(studyName);
  return path.join(sanitizedStudy, datasetName, site, subjectId, filename);
}

/**
 * Get study and dataset info from database
 */
export function getDatasetInfo(datasetId) {
  const dataset = db.prepare(`
    SELECT d.id, d.name as dataset_name, d.study_id, s.name as study_name
    FROM datasets d
    JOIN studies s ON d.study_id = s.id
    WHERE d.id = ?
  `).get(datasetId);

  return dataset;
}

/**
 * Determine target file path for an uploaded image
 * Returns the relative path from data/images/
 */
export function determineTargetPath(filename, datasetId) {
  // Get dataset and study info
  const datasetInfo = getDatasetInfo(datasetId);
  if (!datasetInfo) {
    throw new Error(`Dataset ${datasetId} not found`);
  }

  // Extract subject ID from filename
  const subjectId = extractSubjectId(filename);
  
  // Extract site from dataset name
  const site = extractSiteFromDataset(datasetInfo.dataset_name);

  // If we couldn't extract subject ID, use a fallback
  if (!subjectId) {
    // Fallback: use dataset folder only
    return path.join(datasetInfo.dataset_name, filename);
  }

  // Build full path: study/dataset/site/subject/filename
  return buildFilePath(
    datasetInfo.study_name,
    datasetInfo.dataset_name,
    site,
    subjectId,
    filename
  );
}

/**
 * Ensure directory structure exists
 */
export function ensureDirectoryExists(filePath, baseDir) {
  const fullPath = path.join(baseDir, filePath);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  return fullPath;
}

/**
 * Handle file naming conflicts
 * If file exists, append a number: filename_1.png, filename_2.png, etc.
 */
export function resolveFileNameConflict(targetPath, baseDir) {
  const fullPath = path.join(baseDir, targetPath);
  
  if (!fs.existsSync(fullPath)) {
    return targetPath;
  }

  const dir = path.dirname(fullPath);
  const ext = path.extname(fullPath);
  const basename = path.basename(fullPath, ext);
  
  let counter = 1;
  let newPath;
  
  do {
    const newFilename = `${basename}_${counter}${ext}`;
    newPath = path.join(dir, newFilename);
    counter++;
  } while (fs.existsSync(newPath) && counter < 1000);
  
  // Return relative path
  return path.relative(baseDir, newPath);
}

