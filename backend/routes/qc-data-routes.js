/**
 * QC Data Routes
 * 
 * Handles uploading and processing of QC metrics (Euler numbers)
 */

import multer from 'multer';
import { parse } from 'csv-parse/sync';
import db from '../database.js';

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

export function registerQCRoutes(app, requireAuth, requireAdmin) {

    /**
     * POST /api/admin/upload/euler
     * Upload CSV/TSV with Euler numbers
     */
    app.post('/api/admin/upload/euler', requireAuth, requireAdmin, upload.single('file'), (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            const content = req.file.buffer.toString('utf-8');

            let delimiter = ','; // Default to CSV delimiter
            if (req.file.originalname.endsWith('.tsv') || content.includes('\t')) {
                delimiter = '\t';
            }

            const records = parse(content, {
                columns: true,
                skip_empty_lines: true,
                delimiter: delimiter,
                trim: true,
                relax_column_count: true
            });

            if (records.length === 0) {
                return res.status(400).json({ error: 'No records found in file' });
            }

            // Identify columns
            const headers = Object.keys(records[0]).map(h => h.toLowerCase());
            const eulerCol = headers.find(h => h.includes('euler') || h === 'qc');
            const filenameCol = headers.find(h => h.includes('file') || h === 'image' || h === 'sample');
            const subjectCol = headers.find(h => h.includes('subject') || h === 'sub' || h === 'id');

            if (!eulerCol) {
                return res.status(400).json({ error: 'Could not find Euler number column (look for "euler" or "qc")' });
            }

            if (!filenameCol && !subjectCol) {
                return res.status(400).json({ error: 'Could not find ID column (look for "filename", "file", "subject", or "id")' });
            }

            let updatedCount = 0;
            let notFoundCount = 0;

            const updateStmt = db.prepare('UPDATE samples SET euler_number = ? WHERE id = ?');
            const findByFilename = db.prepare('SELECT id FROM samples WHERE filename LIKE ?');
            const findBySubject = db.prepare("SELECT id FROM samples WHERE filename LIKE ? OR filename LIKE ?");

            const transaction = db.transaction((rows) => {
                for (const row of rows) {
                    // Get euler value
                    const eulerKey = Object.keys(row).find(k => k.toLowerCase() === eulerCol);
                    const eulerValue = parseFloat(row[eulerKey]);

                    if (isNaN(eulerValue)) continue;

                    let sampleIds = [];

                    if (filenameCol) {
                        // Match by proper filename
                        const filenameKey = Object.keys(row).find(k => k.toLowerCase() === filenameCol);
                        let filename = row[filenameKey];

                        // Try exact match first, then partial
                        let match = findByFilename.get(filename);
                        if (!match) match = findByFilename.get(`%${filename}%`);

                        if (match) sampleIds.push(match.id);
                    }

                    if (sampleIds.length === 0 && subjectCol) {
                        // Match by Subject ID (update all samples for this subject)
                        const subjectKey = Object.keys(row).find(k => k.toLowerCase() === subjectCol);
                        const subjectId = row[subjectKey];

                        // Look for filenames containing subject ID (e.g., "sub-12345")
                        // Patterns: "sub-12345_..." or just "12345" inside
                        const samples = findBySubject.all(`%sub-${subjectId}%`, `%${subjectId}%`);
                        sampleIds = samples.map(s => s.id);
                    }

                    if (sampleIds.length > 0) {
                        for (const id of sampleIds) {
                            updateStmt.run(eulerValue, id);
                            updatedCount++;
                        }
                    } else {
                        notFoundCount++;
                    }
                }
            });

            transaction(records);

            res.json({
                success: true,
                message: `Updated ${updatedCount} samples with Euler numbers.`,
                details: {
                    updated: updatedCount,
                    notFound: notFoundCount,
                    totalRows: records.length
                }
            });

        } catch (error) {
            console.error('Euler upload error:', error);
            res.status(500).json({ error: 'Failed to process file: ' + error.message });
        }
    });
}
