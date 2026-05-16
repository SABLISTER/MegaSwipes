/**
 * Image Routes
 * 
 * Handles secure image serving (both local and SSH)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import db from '../database.js';
import sshService from '../ssh-service.js';
import { verifyToken } from '../auth.js';
import { checkDatasetAccess } from '../utils/access-control.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Helper function to serve image file (shared by secure_token and sample ID routes)
 */
async function serveImageFile(sample, res) {
  // Skip SSH for local serving - only use SSH if explicitly needed and configured
  // For local development, always serve from local filesystem
  if (sample.is_ssh && sample.ssh_path && process.env.SSH_ENABLED === 'true') {
    try {
      // Get cached file or download from SSH
      const cachedPath = await sshService.getCachedFile(
        `${process.env.SSH_BASE_PATH || '/data4/asd_meganalysis/SI_test_MH/pulls_for_abide'}/${sample.ssh_path}`
      );

      // Send cached file
      res.set('Cache-Control', 'public, max-age=31536000'); // 1 year
      res.sendFile(cachedPath);
      return;
    } catch (error) {
      console.error('Error serving SSH image:', error);
      // Fall through to local filesystem if SSH fails
    }
  }

  // Handle local images
  // New structure: data/images/study/dataset/site/subject/images.png
  // Go up 2 levels from backend/routes to get to project root
  const projectRoot = path.join(__dirname, '..', '..');
  const dataDir = path.join(projectRoot, 'data');
  const imagesBaseDir = path.join(dataDir, 'images');

  // Get study name for path construction
  const studyInfo = db.prepare(`
    SELECT st.name as study_name, st.id as study_id
    FROM datasets d
    JOIN studies st ON d.study_id = st.id
    WHERE d.id = ?
  `).get(sample.dataset_id);

  // Check if this is a QC study dataset - QC datasets are stored directly in data/{folder}/
  const isQCStudy = studyInfo && studyInfo.study_name === 'QC';

  // Check if file_path uses new structure (contains study/dataset/site/subject)
  // New structure: study/dataset/site/subject/image.png
  // Legacy structure: dataset/subject/image.png or pulls_for_abide/...
  // Split on both forward and backslashes for cross-platform compatibility
  const pathParts = sample.file_path.split(/[/\\]/);
  const isNewStructure = pathParts.length >= 4;
  const isJustFilename = pathParts.length === 1; // Just filename, no folder structure

  let imagePath;

  // Special handling for QC study datasets - files are in data/{folder}/ not data/images/{folder}/
  if (isQCStudy) {
    // For QC datasets, file_path is like "BC/filename.png" or "MH/filename.png"
    // Files are located at data/BC/filename.png
    imagePath = path.join(dataDir, sample.file_path);
  } else if (isJustFilename) {
    // If file_path is just a filename (e.g., "sub-28745_ses-1_run-1_T1w_A1.png")
    // Try common locations first before complex path construction
    const filename = sample.file_path;
    const commonFolders = ['BC', 'MH', 'RG', 'SP'];

    // Try data/{folder}/filename.png first (most likely location)
    let foundPath = null;
    for (const folder of commonFolders) {
      const testPath = path.join(dataDir, folder, filename);
      try {
        await fs.access(testPath);
        foundPath = testPath;
        break;
      } catch (err) {
        // Continue
      }
    }

    // If not found, try data/images/{folder}/filename.png
    if (!foundPath) {
      for (const folder of commonFolders) {
        const testPath = path.join(imagesBaseDir, folder, filename);
        try {
          await fs.access(testPath);
          foundPath = testPath;
          break;
        } catch (err) {
          // Continue
        }
      }
    }

    // If still not found, try data/images/{folder}/sub-*/filename.png
    if (!foundPath) {
      const subjectMatch = filename.match(/^(sub-[^_]+|sub-\d+|\d+)/);
      if (subjectMatch) {
        const subjectId = subjectMatch[1];
        for (const folder of commonFolders) {
          const testPath = path.join(imagesBaseDir, folder, subjectId, filename);
          try {
            await fs.access(testPath);
            foundPath = testPath;
            break;
          } catch (err) {
            // Continue
          }
        }
      }
    }

    imagePath = foundPath || path.join(imagesBaseDir, 'pulls_for_abide', sample.dataset_name, sample.file_path);
  } else if (isNewStructure) {
    // New structure: file_path already has study/dataset/site/subject/image.png
    imagePath = path.join(imagesBaseDir, sample.file_path);
  } else {
    // Legacy structure: try to construct new path or use legacy fallback
    if (studyInfo && studyInfo.study_name) {
      // Try new structure first
      const sanitizedStudy = studyInfo.study_name
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '');

      // Extract site from dataset name
      const siteMatch = sample.dataset_name.match(/^HBN_(.+)$/);
      const site = siteMatch ? siteMatch[1] : 'default';

      // Try to parse subject from file_path (split on both / and \ for cross-platform)
      const legacyPathParts = sample.file_path.split(/[/\\]/);
      const subjectFolder = legacyPathParts[0] || legacyPathParts[legacyPathParts.length - 2];
      const imageFilename = legacyPathParts[legacyPathParts.length - 1];

      if (subjectFolder && imageFilename) {
        const newPath = path.join(sanitizedStudy, sample.dataset_name, site, subjectFolder, imageFilename);
        imagePath = path.join(imagesBaseDir, newPath);
      } else {
        // Fall back to legacy path
        imagePath = path.join(imagesBaseDir, 'pulls_for_abide', sample.dataset_name, sample.file_path);
      }
    } else {
      // Fall back to legacy path
      imagePath = path.join(imagesBaseDir, 'pulls_for_abide', sample.dataset_name, sample.file_path);
    }
  }

  // Check if file exists
  let fileExists = false;
  // If we already found a path in the isJustFilename block, skip the check
  if (isJustFilename && imagePath && imagePath !== path.join(imagesBaseDir, 'pulls_for_abide', sample.dataset_name, sample.file_path)) {
    fileExists = true;
  } else {
    try {
      await fs.access(imagePath);
      fileExists = true;
    } catch (error) {
      // Extract folder name from file_path (e.g., "BC/sub-28745_ses-1_run-1_T1w_A1.png" -> "BC")
      const pathParts = sample.file_path.split(/[/\\]/);
      const filename = path.basename(sample.file_path);
      const folderFromPath = pathParts.length > 0 && pathParts[0] !== filename ? pathParts[0] : null;

      // Common folder names to check
      const commonFolders = ['BC', 'MH', 'RG', 'SP'];
      const foldersToCheck = folderFromPath ? [folderFromPath] : commonFolders;

      // Try legacy paths as fallback
      const legacyPaths = [];

      // If file_path is just a filename (no folder), try all common folders
      // Check data/{folder}/image.png (e.g., data/BC/sub-28745_ses-1_run-1_T1w_A1.png)
      for (const folder of foldersToCheck) {
        legacyPaths.push(path.join(dataDir, folder, filename));
      }

      // Check data/images/{folder}/image.png (e.g., data/images/BC/sub-28745_ses-1_run-1_T1w_A1.png)
      for (const folder of foldersToCheck) {
        legacyPaths.push(path.join(imagesBaseDir, folder, filename));
      }

      // Check data/images/{folder}/sub-*/image.png (e.g., data/images/BC/sub-28745/sub-28745_ses-1_run-1_T1w_A1.png)
      // Extract subject ID from filename (everything before first underscore)
      const subjectMatch = filename.match(/^(sub-[^_]+|sub-\d+|\d+)/);
      if (subjectMatch) {
        const subjectId = subjectMatch[1];
        for (const folder of foldersToCheck) {
          legacyPaths.push(path.join(imagesBaseDir, folder, subjectId, filename));
        }
      }

      // If file_path contains folder structure, try that too
      if (folderFromPath && pathParts.length > 1) {
        legacyPaths.push(path.join(imagesBaseDir, folderFromPath, sample.file_path));
      }

      // Add other legacy paths
      legacyPaths.push(
        // For QC datasets, also try data/{folder}/ directly
        ...(isQCStudy ? [path.join(dataDir, sample.file_path)] : []),
        path.join(imagesBaseDir, 'pulls_for_abide', sample.dataset_name, sample.file_path),
        path.join(imagesBaseDir, 'pulls_for_abide', sample.file_path),
        path.join(imagesBaseDir, sample.dataset_name, sample.file_path),
        path.join(imagesBaseDir, sample.file_path)
      );

      // Try each path
      for (const legacyPath of legacyPaths) {
        try {
          await fs.access(legacyPath);
          fileExists = true;
          imagePath = legacyPath;
          console.log(`✓ Found image at: ${legacyPath}`);
          break;
        } catch (err) {
          // Continue to next path
        }
      }

      if (!fileExists) {
        // File not found in any location
        console.error('❌ Image file not found. Tried paths:', [
          imagePath,
          ...legacyPaths.slice(0, 10) // Log first 10 paths to avoid spam
        ]);
        console.error('Sample info:', {
          dataset_name: sample.dataset_name,
          file_path: sample.file_path,
          filename: filename,
          folderFromPath: folderFromPath
        });
        return res.status(404).json({ error: 'Image file not found' });
      }
    }
  }

  // Send the image with cache headers
  res.set('Cache-Control', 'public, max-age=31536000'); // 1 year
  res.sendFile(imagePath);
}

/**
 * Register image routes
 * @param {Express} app - Express application instance
 * @param {Function} requireAuth - Authentication middleware (not used for image routes, but kept for API consistency)
 */
export function registerImageRoutes(app, requireAuth) {
  /**
   * GET /api/images/:secureToken
   * Serve image files using secure tokens (supports both local and SSH)
   * Note: This endpoint checks authentication via cookies (which img tags can send).
   * Security is provided by the secure token itself, but we also verify user access.
   */
  app.get('/api/images/:secureToken', async (req, res) => {
    try {
      const { secureToken } = req.params;

      // Look up the sample by secure token, including dataset name for path construction
      const sample = db.prepare(`
        SELECT s.file_path, s.ssh_path, s.dataset_id, d.name as dataset_name, d.is_public, d.is_ssh, d.ssh_path as dataset_ssh_path
        FROM samples s
        JOIN datasets d ON s.dataset_id = d.id
        WHERE s.secure_token = ?
      `).get(secureToken);

      if (!sample) {
        return res.status(404).json({ error: 'Image not found' });
      }

      // Check authentication via cookie (img tags can send cookies)
      const token = req.cookies.token;
      if (token) {
        const user = verifyToken(token);
        if (user) {
          // Verify user has access to this dataset
          if (!checkDatasetAccess(sample.dataset_id, user.id)) {
            return res.status(403).json({ error: 'Access denied' });
          }
        } else if (!sample.is_public) {
          // If token is invalid and dataset is private, deny access
          return res.status(403).json({ error: 'Authentication required' });
        }
      } else if (!sample.is_public) {
        // No token and dataset is private, deny access
        return res.status(403).json({ error: 'Authentication required' });
      }

      // Use the shared image serving logic
      await serveImageFile(sample, res);
    } catch (error) {
      console.error('Error serving image:', error);
      res.status(500).json({ error: 'Failed to serve image' });
    }
  });

  /**
   * GET /api/samples/:id/image
   * Serve image files by sample ID
   * Used as fallback when secure_token is missing
   * Note: This endpoint checks authentication via cookies (which img tags can send).
   * Security: Verifies user has access to the dataset via authentication cookie.
   */
  app.get('/api/samples/:id/image', async (req, res) => {
    try {
      const sampleId = parseInt(req.params.id);

      if (isNaN(sampleId)) {
        return res.status(400).json({ error: 'Invalid sample ID' });
      }

      // Look up the sample by ID, including dataset info for path construction
      const sample = db.prepare(`
        SELECT s.file_path, s.ssh_path, s.dataset_id, d.name as dataset_name, d.is_public, d.is_ssh, d.ssh_path as dataset_ssh_path
        FROM samples s
        JOIN datasets d ON s.dataset_id = d.id
        WHERE s.id = ?
      `).get(sampleId);

      if (!sample) {
        return res.status(404).json({ error: 'Image not found' });
      }

      // Check authentication via cookie (img tags can send cookies)
      const token = req.cookies.token;
      if (token) {
        const user = verifyToken(token);
        if (user) {
          // Verify user has access to this dataset
          if (!checkDatasetAccess(sample.dataset_id, user.id)) {
            return res.status(403).json({ error: 'Access denied' });
          }
        } else if (!sample.is_public) {
          // If token is invalid and dataset is private, deny access
          return res.status(403).json({ error: 'Authentication required' });
        }
      } else if (!sample.is_public) {
        // No token and dataset is private, deny access
        return res.status(403).json({ error: 'Authentication required' });
      }

      // Use the same image serving logic as the secure_token route
      await serveImageFile(sample, res);
    } catch (error) {
      console.error('Error serving image by sample ID:', error);
      res.status(500).json({ error: 'Failed to serve image' });
    }
  });


  /**
   * GET /images/:datasetId/:filename
   * Serve image files (DEPRECATED - kept for backward compatibility)
   * @deprecated Use /api/images/:secureToken instead
   */
  app.get('/images/:datasetId/:filename', async (req, res) => {
    try {
      const { datasetId, filename } = req.params;

      console.warn('⚠️  DEPRECATED: /images/:datasetId/:filename endpoint used. Please migrate to /api/images/:secureToken');

      // Construct the image path - go up 2 levels from backend/routes to project root
      const imagePath = path.join(__dirname, '..', '..', 'data', 'images', 'pulls_for_abide', datasetId, filename);

      // Check if file exists
      try {
        await fs.access(imagePath);
      } catch (error) {
        return res.status(404).json({ error: 'Image not found' });
      }

      // Send the image with cache headers
      res.set('Cache-Control', 'public, max-age=31536000'); // 1 year
      res.sendFile(imagePath);
    } catch (error) {
      console.error('Error serving image:', error);
      res.status(500).json({ error: 'Failed to serve image' });
    }
  });
}

