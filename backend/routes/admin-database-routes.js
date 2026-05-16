/**
 * Admin Database Management Routes
 * 
 * Handles database maintenance, backups, and file-based imports.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import db from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
// Assuming routes are in backend/routes/, so we go up one level to backend, then one to root, then to data
const PROJECT_ROOT = path.join(__dirname, '../..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'backups');
const DB_PATH = path.join(DATA_DIR, 'neuroqc.db');

/**
 * Register admin database routes
 */
export function registerAdminDatabaseRoutes(app, requireAuth, requireAdmin) {
  
  // ==========================================================================
  // MAINTENANCE & BACKUP
  // ==========================================================================

  /**
   * POST /api/admin/database/backup
   * Create a backup of the SQLite database
   */
  app.post('/api/admin/database/backup', requireAuth, requireAdmin, async (req, res) => {
    try {
      if (!fs.existsSync(BACKUPS_DIR)) {
        await fs.promises.mkdir(BACKUPS_DIR, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const backupFilename = `neuroqc-backup-${timestamp}.db`;
      const backupPath = path.join(BACKUPS_DIR, backupFilename);

      if (!fs.existsSync(DB_PATH)) {
        return res.status(404).json({ error: 'Database file not found' });
      }

      // Copy database file
      await fs.promises.copyFile(DB_PATH, backupPath);

      // Copy WAL and SHM if they exist
      if (fs.existsSync(DB_PATH + '-wal')) {
        await fs.promises.copyFile(DB_PATH + '-wal', backupPath + '-wal');
      }
      if (fs.existsSync(DB_PATH + '-shm')) {
        await fs.promises.copyFile(DB_PATH + '-shm', backupPath + '-shm');
      }

      const stats = await fs.promises.stat(backupPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      res.json({
        success: true,
        message: 'Database backup created successfully',
        filename: backupFilename,
        path: backupPath,
        sizeMB
      });
    } catch (error) {
      console.error('Backup error:', error);
      res.status(500).json({ error: 'Failed to create backup: ' + error.message });
    }
  });

  /**
   * POST /api/admin/database/maintenance/fix-fk
   * Check and fix foreign key constraints
   */
  app.post('/api/admin/database/maintenance/fix-fk', requireAuth, requireAdmin, (req, res) => {
    try {
      // Check for violations
      const violations = db.prepare('PRAGMA foreign_key_check').all();
      
      // Ensure foreign keys are on
      db.pragma('foreign_keys = ON');
      const fkEnabled = db.pragma('foreign_keys', { simple: true });

      if (violations.length > 0) {
        res.json({
          success: true,
          message: `Found ${violations.length} foreign key violations. Foreign keys enforcement is now ${fkEnabled ? 'ON' : 'OFF'}.`,
          violations,
          fkEnabled
        });
      } else {
        res.json({
          success: true,
          message: 'No foreign key violations found. constraints are healthy.',
          violations: [],
          fkEnabled
        });
      }
    } catch (error) {
      console.error('Fix foreign keys error:', error);
      res.status(500).json({ error: 'Failed to check foreign keys' });
    }
  });

  /**
   * POST /api/admin/database/maintenance/add-tokens
   * Generate missing secure tokens for samples
   */
  app.post('/api/admin/database/maintenance/add-tokens', requireAuth, requireAdmin, (req, res) => {
    try {
      // 1. Ensure columns exist (idempotent columns check)
      const tableInfo = db.prepare("PRAGMA table_info(samples)").all();
      const hasSecureToken = tableInfo.some(col => col.name === 'secure_token');
      const hasFilePath = tableInfo.some(col => col.name === 'file_path');
      
      if (!hasSecureToken) {
        db.exec('ALTER TABLE samples ADD COLUMN secure_token TEXT UNIQUE');
        db.exec('CREATE INDEX IF NOT EXISTS idx_samples_secure_token ON samples(secure_token)');
      }
      if (!hasFilePath) {
        db.exec('ALTER TABLE samples ADD COLUMN file_path TEXT');
      }

      // 2. Find samples needing updates
      const samples = db.prepare(`
        SELECT s.id, s.filename, d.image_path
        FROM samples s
        JOIN datasets d ON s.dataset_id = d.id
        WHERE s.secure_token IS NULL OR s.file_path IS NULL
      `).all();

      if (samples.length === 0) {
        return res.json({ success: true, message: 'All samples already have secure tokens.' });
      }

      // 3. Update samples
      const updateStmt = db.prepare(`
        UPDATE samples 
        SET secure_token = COALESCE(secure_token, ?), 
            file_path = COALESCE(file_path, ?)
        WHERE id = ?
      `);

      let updated = 0;
      const runTransaction = db.transaction((items) => {
        for (const sample of items) {
          const token = randomUUID();
          const filePath = `${sample.image_path}/${sample.filename}`;
          
          updateStmt.run(token, filePath, sample.id);
          updated++;
        }
      });

      runTransaction(samples);

      res.json({
        success: true,
        message: `Successfully generated tokens for ${updated} samples.`,
        count: updated
      });

    } catch (error) {
      console.error('Add tokens error:', error);
      res.status(500).json({ error: 'Failed to add secure tokens: ' + error.message });
    }
  });

  // ==========================================================================
  // IMPORT WIZARD
  // ==========================================================================

  /**
   * GET /api/admin/database/scan
   * Scan data/images for top-level folders (Import Step 1)
   */
  app.get('/api/admin/database/scan', requireAuth, requireAdmin, async (req, res) => {
    try {
      if (!fs.existsSync(IMAGES_DIR)) {
        return res.status(404).json({ error: 'Images directory not found' });
      }

      const items = await fs.promises.readdir(IMAGES_DIR, { withFileTypes: true });
      const folders = items
        .filter(item => item.isDirectory())
        .map(item => item.name);

      // Check existence in DB (DB operations are fast/sync for sqlite, so this is fine)
      const result = folders.map(name => {
        const existing = db.prepare('SELECT id, name FROM datasets WHERE name = ?').get(name);
        return {
          name,
          existsInDb: !!existing,
          datasetId: existing ? existing.id : null
        };
      });

      res.json(result);
    } catch (error) {
      console.error('Scan folder error:', error);
      res.status(500).json({ error: 'Failed to scan images folder' });
    }
  });

  /**
   * POST /api/admin/database/scan-sites
   * Scan specific dataset folders for sites/subfolders (Import Step 2)
   */
  app.post('/api/admin/database/scan-sites', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { folders } = req.body; // Array of folder names
      if (!folders || !Array.isArray(folders)) {
        return res.status(400).json({ error: 'Invalid folders list' });
      }

      const results = {};

      for (const folder of folders) {
        const folderPath = path.join(IMAGES_DIR, folder);
        if (fs.existsSync(folderPath)) {
          const items = await fs.promises.readdir(folderPath, { withFileTypes: true });
          const sites = items
            .filter(item => item.isDirectory())
            .map(item => item.name);
          
          results[folder] = {
            hasSites: sites.length > 0,
            sites: sites
          };
        } else {
          results[folder] = { error: 'Folder not found' };
        }
      }

      res.json(results);
    } catch (error) {
      console.error('Scan sites error:', error);
      res.status(500).json({ error: 'Failed to scan sites' });
    }
  });

  /**
   * POST /api/admin/database/import
   * Execute import (Import Step 3)
   */
  app.post('/api/admin/database/import', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { studyId, selections } = req.body;

      if (!studyId || !selections || !Array.isArray(selections)) {
        return res.status(400).json({ error: 'Invalid import parameters' });
      }

      // Verify study
      const study = db.prepare('SELECT id FROM studies WHERE id = ?').get(studyId);
      if (!study) {
        return res.status(404).json({ error: 'Study not found' });
      }

      const report = [];

      for (const selection of selections) {
        const dsName = selection.folder;
        const sites = selection.sites || [];
        const dsPath = path.join(IMAGES_DIR, dsName);

        if (!fs.existsSync(dsPath)) {
          report.push({ dataset: dsName, status: 'error', message: 'Directory not found' });
          continue;
        }

        // Determine directories to scan
        let dirsToScan = [];
        if (sites.length > 0) {
          dirsToScan = sites.map(s => path.join(dsPath, s));
        } else {
          dirsToScan = [dsPath];
        }

        // Find PNGs (Recursively but carefully)
        // Since we are optimizing, we stick to sync fs or careful async for recursion.
        // For simplicity and matching current architecture where DB writes are sync blocking anyway,
        // we will use a custom recursive scanner that returns paths.
        
        let newSamples = [];
        
        for (const dir of dirsToScan) {
           // Async recursive scanner
           const scanDir = async (directory) => {
             if (!fs.existsSync(directory)) return [];
             let results = [];
             const items = await fs.promises.readdir(directory, { withFileTypes: true });
             
             for (const item of items) {
               const fullPath = path.join(directory, item.name);
               if (item.isDirectory()) {
                 results = results.concat(await scanDir(fullPath));
               } else if (item.isFile() && item.name.toLowerCase().endsWith('.png')) {
                 results.push(fullPath);
               }
             }
             return results;
           };
           
           const foundFiles = await scanDir(dir);
           
           // Check for duplicates
           for (const file of foundFiles) {
             const relPath = path.relative(DATA_DIR, file);
             // We can't prepare stmt inside async loop strictly speaking if using bettersqlite3 in async context casually without care,
             // but bettersqlite3 is synchronous. So we can just call it.
             const existing = db.prepare('SELECT id FROM samples WHERE file_path = ?').get(relPath);
             
             if (!existing) {
               newSamples.push({ file, relPath });
             }
           }
        }

        if (newSamples.length === 0) {
          report.push({ dataset: dsName, status: 'skipped', message: 'No new images found' });
          continue;
        }

        // Create or Get Dataset
        let dataset = db.prepare('SELECT * FROM datasets WHERE name = ?').get(dsName);
        let datasetId = dataset ? dataset.id : null;

        if (!dataset) {
          const res = db.prepare(`
            INSERT INTO datasets (study_id, name, image_path, is_public, description)
            VALUES (?, ?, ?, ?, ?)
          `).run(studyId, dsName, `images/${dsName}`, 0, `Imported from ${dsName}`);
          datasetId = res.lastInsertRowid;
        }

        // Insert Samples
        let added = 0;
        let errors = 0;

        const insertStmt = db.prepare(`
           INSERT INTO samples (dataset_id, filename, file_path, secure_token)
           VALUES (?, ?, ?, ?)
        `);

        // Transaction is synchronous
        const insertTx = db.transaction((samples) => {
          for (const item of samples) {
             try {
               const filename = path.basename(item.file);
               insertStmt.run(datasetId, filename, item.relPath, randomUUID());
               added++;
             } catch (e) {
               errors++;
             }
          }
        });

        insertTx(newSamples);

        report.push({ 
          dataset: dsName, 
          status: 'success', 
          newDataset: !dataset,
          added, 
          errors 
        });
      }

      res.json({ success: true, report });

    } catch (error) {
      console.error('Import process error:', error);
      res.status(500).json({ error: 'Import failed: ' + error.message });
    }
  });

  // ==========================================================================
  // ADVANCED MANIPULATION
  // ==========================================================================

  /**
   * POST /api/admin/database/query
   * Execute raw SQL query (Admin ONLY)
   */
  app.post('/api/admin/database/query', requireAuth, requireAdmin, (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Invalid query' });
      }

      const trimmed = query.trim().toLowerCase();
      const isSelect = trimmed.startsWith('select') || trimmed.startsWith('pragma') || trimmed.startsWith('explain');

      let result;
      const stmt = db.prepare(query);

      if (isSelect) {
        result = stmt.all();
        res.json({ success: true, type: 'SELECT', rows: result });
      } else {
        result = stmt.run();
        res.json({ success: true, type: 'EXECUTE', changes: result.changes, lastInsertRowid: result.lastInsertRowid });
      }
    } catch (error) {
      console.error('SQL Execution error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // ==========================================================================
  // TABLE BROWSER
  // ==========================================================================

  /**
   * GET /api/admin/database/tables
   * List all tables
   */
  app.get('/api/admin/database/tables', requireAuth, requireAdmin, (req, res) => {
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      res.json(tables.map(t => t.name));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/admin/database/tables/:name/data
   * Get table data with pagination
   */
  app.get('/api/admin/database/tables/:name/data', requireAuth, requireAdmin, (req, res) => {
    try {
      const tableName = req.params.name;
      // Validate table name to prevent injection
      const validTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
      if (!validTables.includes(tableName)) {
        return res.status(404).json({ error: 'Table not found' });
      }

      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const rows = db.prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`).all(limit, offset);
      const count = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get();
      const structure = db.prepare(`PRAGMA table_info("${tableName}")`).all();

      res.json({ rows, total: count.count, structure });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/admin/database/tables/:name/export
   * Export table as CSV
   */
  app.get('/api/admin/database/tables/:name/export', requireAuth, requireAdmin, (req, res) => {
    try {
      const tableName = req.params.name;
      const validTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
      if (!validTables.includes(tableName)) {
        return res.status(404).json({ error: 'Table not found' });
      }

      const rows = db.prepare(`SELECT * FROM "${tableName}"`).all();
      
      if (rows.length === 0) {
         res.header('Content-Type', 'text/csv');
         res.attachment(`${tableName}.csv`);
         return res.send('');
      }

      const headers = Object.keys(rows[0]);
      const csv = [
        headers.join(','),
        ...rows.map(row => headers.map(fieldName => {
          const val = row[fieldName];
          if (val === null) return '';
          if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
          return val;
        }).join(','))
      ].join('\n');

      res.header('Content-Type', 'text/csv');
      res.attachment(`${tableName}.csv`);
      res.send(csv);

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

}
