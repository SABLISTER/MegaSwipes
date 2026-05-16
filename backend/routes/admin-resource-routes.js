/**
 * Admin Resource Management Routes
 * 
 * Handles management of Studies, Datasets, Samples, and Access Control.
 * Extracted from server.js for cleaner architecture.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerAdminResourceRoutes(app, requireAuth, requireAdmin) {

    // ============================================================================
    // DATASET MANAGEMENT
    // ============================================================================

    /**
     * GET /api/admin/datasets
     * List all datasets with statistics
     */
    app.get('/api/admin/datasets', requireAuth, requireAdmin, (req, res) => {
        try {
            const datasets = db.prepare(`
        SELECT 
          d.id,
          d.study_id,
          d.name,
          d.description,
          d.image_path,
          d.is_public,
          d.created_at,
          s.name as study_name,
          (SELECT COUNT(*) FROM samples WHERE dataset_id = d.id) as sample_count,
          (SELECT COUNT(DISTINCT 
            CASE 
              WHEN file_path LIKE 'sub-%/%' THEN 
                SUBSTR(file_path, 1, INSTR(file_path, '/') - 1)
              WHEN file_path LIKE '%/sub-%/%' THEN 
                SUBSTR(file_path, INSTR(file_path, '/sub-') + 1, INSTR(SUBSTR(file_path, INSTR(file_path, '/sub-') + 1), '/') - 1)
              ELSE NULL
            END
          ) FROM samples WHERE dataset_id = d.id AND file_path IS NOT NULL) as subject_count,
          (SELECT COUNT(*) FROM votes v JOIN samples sam ON v.sample_id = sam.id WHERE sam.dataset_id = d.id) as vote_count,
          (SELECT AVG(rating) FROM votes v JOIN samples sam ON v.sample_id = sam.id WHERE sam.dataset_id = d.id) as average_rating
        FROM datasets d
        JOIN studies s ON d.study_id = s.id
        ORDER BY d.created_at DESC
      `).all();

            res.json(datasets);
        } catch (error) {
            console.error('Get admin datasets error:', error);
            res.status(500).json({ error: 'Failed to get datasets' });
        }
    });

    /**
     * POST /api/admin/datasets
     * Create new dataset
     */
    app.post('/api/admin/datasets', requireAuth, requireAdmin, (req, res) => {
        try {
            const { study_id, name, description, image_path, is_public } = req.body;

            if (!study_id || !name || !image_path) {
                return res.status(400).json({ error: 'study_id, name, and image_path are required' });
            }

            const result = db.prepare(`
        INSERT INTO datasets (study_id, name, description, image_path, is_public)
        VALUES (?, ?, ?, ?, ?)
      `).run(study_id, name, description || null, image_path, is_public ? 1 : 0);

            const dataset = db.prepare(`
        SELECT d.*, s.name as study_name
        FROM datasets d
        JOIN studies s ON d.study_id = s.id
        WHERE d.id = ?
      `).get(result.lastInsertRowid);

            res.json(dataset);
        } catch (error) {
            console.error('Create dataset error:', error);
            res.status(500).json({ error: 'Failed to create dataset' });
        }
    });

    /**
     * PUT /api/admin/datasets/:id
     * Update dataset
     */
    app.put('/api/admin/datasets/:id', requireAuth, requireAdmin, (req, res) => {
        try {
            const { name, description, image_path, is_public, study_id } = req.body;
            const updates = [];
            const values = [];

            if (study_id !== undefined) {
                updates.push('study_id = ?');
                values.push(study_id);
            }
            if (name !== undefined) {
                updates.push('name = ?');
                values.push(name);
            }
            if (description !== undefined) {
                updates.push('description = ?');
                values.push(description);
            }
            if (image_path !== undefined) {
                updates.push('image_path = ?');
                values.push(image_path);
            }
            if (is_public !== undefined) {
                updates.push('is_public = ?');
                values.push(is_public ? 1 : 0);
            }

            if (updates.length === 0) {
                return res.status(400).json({ error: 'No fields to update' });
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            values.push(req.params.id);

            db.prepare(`
        UPDATE datasets
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...values);

            const dataset = db.prepare(`
        SELECT d.*, s.name as study_name
        FROM datasets d
        JOIN studies s ON d.study_id = s.id
        WHERE d.id = ?
      `).get(req.params.id);

            res.json(dataset);
        } catch (error) {
            console.error('Update dataset error:', error);
            res.status(500).json({ error: 'Failed to update dataset' });
        }
    });

    /**
     * DELETE /api/admin/datasets/:id
     * Delete dataset (cascades to samples and votes)
     */
    app.delete('/api/admin/datasets/:id', requireAuth, requireAdmin, (req, res) => {
        try {
            const result = db.prepare('DELETE FROM datasets WHERE id = ?').run(req.params.id);

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Dataset not found' });
            }

            res.json({ success: true, message: 'Dataset deleted successfully' });
        } catch (error) {
            console.error('Delete dataset error:', error);
            res.status(500).json({ error: 'Failed to delete dataset' });
        }
    });

    // ============================================================================
    // SAMPLE MANAGEMENT
    // ============================================================================

    /**
     * GET /api/admin/samples
     * List samples with optional dataset filter
     */
    app.get('/api/admin/samples', requireAuth, requireAdmin, (req, res) => {
        try {
            const { dataset_id } = req.query;

            let query = `
        SELECT 
          s.id,
          s.dataset_id,
          s.filename,
          s.vote_count,
          s.average_rating,
          s.created_at,
          d.name as dataset_name,
          d.image_path
        FROM samples s
        JOIN datasets d ON s.dataset_id = d.id
      `;

            const params = [];
            if (dataset_id) {
                query += ' WHERE s.dataset_id = ?';
                params.push(dataset_id);
            }

            query += ' ORDER BY s.created_at DESC';

            const samples = db.prepare(query).all(...params);
            res.json(samples);
        } catch (error) {
            console.error('Get admin samples error:', error);
            res.status(500).json({ error: 'Failed to get samples' });
        }
    });

    /**
     * POST /api/admin/samples/bulk
     * Bulk import samples from image folder
     */
    app.post('/api/admin/samples/bulk', requireAuth, requireAdmin, async (req, res) => {
        try {
            const { dataset_id } = req.body;

            if (!dataset_id) {
                return res.status(400).json({ error: 'dataset_id is required' });
            }

            // Get dataset to find image_path
            const dataset = db.prepare('SELECT image_path FROM datasets WHERE id = ?').get(dataset_id);
            if (!dataset) {
                return res.status(404).json({ error: 'Dataset not found' });
            }

            // Scan image folder - using fs.promises from main import
            // Go up from routes/ to backend/ to root/ to data/
            const imagesPath = path.join(__dirname, '../../data', 'images', dataset.image_path.replace('images/', ''));
            // Note: original code used fixed path logic assuming structure. let's keep robust relative path:
            // In server.js (backend root), path was path.join(__dirname, '..', 'data', 'images', ...)
            // Here in routes/ (subdir), we need one more .. 

            const realImagesPath = path.join(__dirname, '../../data', 'images', dataset.image_path.replace(/^images\//, ''));

            try {
                await fs.promises.access(realImagesPath);
            } catch (error) {
                // Fallback to simpler path logic if the replacement fails expectations
                // Original: path.join(__dirname, '..', 'data', 'images', dataset.image_path);
                // If dataset.image_path INCLUDES 'images/', we might be doubling up.
                // Let's assume standard structure: data/images/[DatasetName]
                return res.status(404).json({ error: `Image folder not found: ${dataset.image_path}` });
            }

            const files = await fs.promises.readdir(realImagesPath);
            const imageFiles = files.filter(f =>
                f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.gif')
            );

            if (imageFiles.length === 0) {
                return res.status(400).json({ error: 'No image files found in folder' });
            }

            // Insert samples
            const insertSample = db.prepare(`
        INSERT OR IGNORE INTO samples (dataset_id, filename)
        VALUES (?, ?)
      `);

            let imported = 0;
            const insertMany = db.transaction((files) => {
                for (const file of files) {
                    const result = insertSample.run(dataset_id, file);
                    if (result.changes > 0) imported++;
                }
            });

            insertMany(imageFiles);

            res.json({
                success: true,
                message: `Imported ${imported} new samples (${imageFiles.length - imported} already existed)`,
                imported,
                total: imageFiles.length
            });
        } catch (error) {
            console.error('Bulk import error:', error);
            res.status(500).json({ error: 'Failed to import samples' });
        }
    });

    /**
     * DELETE /api/admin/samples/:id
     * Delete sample (cascades to votes)
     */
    app.delete('/api/admin/samples/:id', requireAuth, requireAdmin, (req, res) => {
        try {
            const result = db.prepare('DELETE FROM samples WHERE id = ?').run(req.params.id);

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Sample not found' });
            }

            res.json({ success: true, message: 'Sample deleted successfully' });
        } catch (error) {
            console.error('Delete sample error:', error);
            res.status(500).json({ error: 'Failed to delete sample' });
        }
    });

    // ============================================================================
    // STUDY MANAGEMENT
    // ============================================================================

    /**
     * GET /api/admin/studies
     * List all studies with dataset counts
     */
    app.get('/api/admin/studies', requireAuth, requireAdmin, (req, res) => {
        try {
            const studies = db.prepare(`
        SELECT 
          s.id,
          s.name,
          s.description,
          s.created_at,
          (SELECT COUNT(*) FROM datasets WHERE study_id = s.id) as dataset_count
        FROM studies s
        ORDER BY s.created_at DESC
      `).all();

            res.json(studies);
        } catch (error) {
            console.error('Get studies error:', error);
            res.status(500).json({ error: 'Failed to get studies' });
        }
    });

    /**
     * POST /api/admin/studies
     * Create new study
     */
    app.post('/api/admin/studies', requireAuth, requireAdmin, (req, res) => {
        try {
            const { name, description } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'name is required' });
            }

            const result = db.prepare(`
        INSERT INTO studies (name, description)
        VALUES (?, ?)
      `).run(name, description || null);

            const study = db.prepare('SELECT * FROM studies WHERE id = ?').get(result.lastInsertRowid);
            res.json(study);
        } catch (error) {
            console.error('Create study error:', error);
            res.status(500).json({ error: 'Failed to create study' });
        }
    });

    /**
     * PUT /api/admin/studies/:id
     * Update study
     */
    app.put('/api/admin/studies/:id', requireAuth, requireAdmin, (req, res) => {
        try {
            const { name, description } = req.body;
            const updates = [];
            const values = [];

            if (name !== undefined) {
                updates.push('name = ?');
                values.push(name);
            }
            if (description !== undefined) {
                updates.push('description = ?');
                values.push(description);
            }

            if (updates.length === 0) {
                return res.status(400).json({ error: 'No fields to update' });
            }

            updates.push('updated_at = CURRENT_TIMESTAMP');
            values.push(req.params.id);

            db.prepare(`
        UPDATE studies
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...values);

            const study = db.prepare('SELECT * FROM studies WHERE id = ?').get(req.params.id);
            res.json(study);
        } catch (error) {
            console.error('Update study error:', error);
            res.status(500).json({ error: 'Failed to update study' });
        }
    });

    /**
     * DELETE /api/admin/studies/:id
     * Delete study (cascades to datasets, samples, votes)
     */
    app.delete('/api/admin/studies/:id', requireAuth, requireAdmin, (req, res) => {
        try {
            const result = db.prepare('DELETE FROM studies WHERE id = ?').run(req.params.id);

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Study not found' });
            }

            res.json({ success: true, message: 'Study deleted successfully' });
        } catch (error) {
            console.error('Delete study error:', error);
            res.status(500).json({ error: 'Failed to delete study' });
        }
    });

    // ============================================================================
    // ACCESS CONTROL
    // ============================================================================

    /**
     * GET /api/admin/access
     * List all user-dataset access grants
     */
    app.get('/api/admin/access', requireAuth, requireAdmin, (req, res) => {
        try {
            const access = db.prepare(`
        SELECT 
          uda.user_id,
          uda.dataset_id,
          uda.access_granted_at,
          u.username,
          u.email,
          d.name as dataset_name
        FROM user_dataset_access uda
        JOIN users u ON uda.user_id = u.id
        JOIN datasets d ON uda.dataset_id = d.id
        ORDER BY uda.access_granted_at DESC
      `).all();

            res.json(access);
        } catch (error) {
            console.error('Get access grants error:', error);
            res.status(500).json({ error: 'Failed to get access grants' });
        }
    });

    /**
     * POST /api/admin/users/:userId/access/:datasetId
     * Grant user access to dataset
     */
    app.post('/api/admin/users/:userId/access/:datasetId', requireAuth, requireAdmin, (req, res) => {
        try {
            db.prepare(`
        INSERT OR IGNORE INTO user_dataset_access (user_id, dataset_id)
        VALUES (?, ?)
      `).run(req.params.userId, req.params.datasetId);

            res.json({ success: true });
        } catch (error) {
            console.error('Grant access error:', error);
            res.status(500).json({ error: 'Failed to grant access' });
        }
    });

    /**
     * DELETE /api/admin/users/:userId/access/:datasetId
     * Revoke user access to dataset
     */
    app.delete('/api/admin/users/:userId/access/:datasetId', requireAuth, requireAdmin, (req, res) => {
        try {
            db.prepare(`
        DELETE FROM user_dataset_access
        WHERE user_id = ? AND dataset_id = ?
      `).run(req.params.userId, req.params.datasetId);

            res.json({ success: true });
        } catch (error) {
            console.error('Revoke access error:', error);
            res.status(500).json({ error: 'Failed to revoke access' });
        }
    });
}
