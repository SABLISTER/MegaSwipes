/**
 * Upload Routes
 * 
 * Handles file uploads for images with automatic organization
 * and database entry creation
 */

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import db from '../database.js';
import {
  determineTargetPath,
  ensureDirectoryExists,
  resolveFileNameConflict
} from '../utils/file-organizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');
const imagesBaseDir = path.join(projectRoot, 'data', 'images');

// Configure multer for memory storage (we'll write files ourselves)
const storage = multer.memoryStorage();

// File filter - only allow image files
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PNG, JPG, JPEG, and GIF are allowed.'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB per file
  }
});

/**
 * Register upload routes
 * @param {Express} app - Express application instance
 * @param {Function} requireAuth - Authentication middleware
 * @param {Function} requireAdmin - Admin authentication middleware
 */
export function registerUploadRoutes(app, requireAuth, requireAdmin) {
  /**
   * POST /api/admin/upload/single
   * Upload a single image file
   */
  app.post('/api/admin/upload/single', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { dataset_id } = req.body;
      if (!dataset_id) {
        return res.status(400).json({ error: 'dataset_id is required' });
      }

      // Verify dataset exists
      const dataset = db.prepare('SELECT id FROM datasets WHERE id = ?').get(dataset_id);
      if (!dataset) {
        return res.status(404).json({ error: 'Dataset not found' });
      }

      const filename = req.file.originalname;
      
      // Determine target path
      let targetPath;
      try {
        targetPath = determineTargetPath(filename, dataset_id);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }

      // Resolve file name conflicts
      targetPath = resolveFileNameConflict(targetPath, imagesBaseDir);

      // Ensure directory exists
      const fullPath = ensureDirectoryExists(targetPath, imagesBaseDir);

      // Write file to disk
      fs.writeFileSync(fullPath, req.file.buffer);

      // Generate secure token
      const secureToken = randomUUID();

      // Create database entry
      const insertSample = db.prepare(`
        INSERT INTO samples (dataset_id, filename, secure_token, file_path)
        VALUES (?, ?, ?, ?)
      `);

      const result = insertSample.run(dataset_id, filename, secureToken, targetPath);

      res.json({
        success: true,
        message: 'Image uploaded successfully',
        sample: {
          id: result.lastInsertRowid,
          filename: filename,
          file_path: targetPath,
          secure_token: secureToken
        }
      });
    } catch (error) {
      console.error('Single upload error:', error);
      res.status(500).json({ error: 'Failed to upload image: ' + error.message });
    }
  });

  /**
   * POST /api/admin/upload/batch
   * Upload multiple image files
   */
  app.post('/api/admin/upload/batch', requireAuth, requireAdmin, upload.array('images', 100), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const { dataset_id } = req.body;
      if (!dataset_id) {
        return res.status(400).json({ error: 'dataset_id is required' });
      }

      // Verify dataset exists
      const dataset = db.prepare('SELECT id FROM datasets WHERE id = ?').get(dataset_id);
      if (!dataset) {
        return res.status(404).json({ error: 'Dataset not found' });
      }

      const results = {
        success: [],
        failed: []
      };

      // Prepare database statements
      const insertSample = db.prepare(`
        INSERT INTO samples (dataset_id, filename, secure_token, file_path)
        VALUES (?, ?, ?, ?)
      `);

      // Process each file
      for (const file of req.files) {
        try {
          const filename = file.originalname;

          // Determine target path
          let targetPath;
          try {
            targetPath = determineTargetPath(filename, dataset_id);
          } catch (error) {
            results.failed.push({
              filename: filename,
              error: error.message
            });
            continue;
          }

          // Resolve file name conflicts
          targetPath = resolveFileNameConflict(targetPath, imagesBaseDir);

          // Ensure directory exists
          const fullPath = ensureDirectoryExists(targetPath, imagesBaseDir);

          // Write file to disk
          fs.writeFileSync(fullPath, file.buffer);

          // Generate secure token
          const secureToken = randomUUID();

          // Create database entry
          const result = insertSample.run(dataset_id, filename, secureToken, targetPath);

          results.success.push({
            id: result.lastInsertRowid,
            filename: filename,
            file_path: targetPath,
            secure_token: secureToken
          });
        } catch (error) {
          console.error(`Error processing file ${file.originalname}:`, error);
          results.failed.push({
            filename: file.originalname,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        message: `Uploaded ${results.success.length} images${results.failed.length > 0 ? `, ${results.failed.length} failed` : ''}`,
        results: results
      });
    } catch (error) {
      console.error('Batch upload error:', error);
      res.status(500).json({ error: 'Failed to upload images: ' + error.message });
    }
  });
}

