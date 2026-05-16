#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = path.join(__dirname, '../../'); //backs out two directories to project root
// Adjust to '/home/mhouse/MegaSwipes/data/' it is looking in script folder now
const dbPath = path.join(projectRoot, 'data', 'neuroqc.db'); //adds data/neuroqc.db to project root
const backupDir = path.join(projectRoot, 'backups');

// Create backups directory if it doesn't exist
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`Created backup directory: ${backupDir}`);
}

// Generate timestamp for backup filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const backupFilename = `neuroqc-backup-${timestamp}.db`;
const backupPath = path.join(backupDir, backupFilename);

// Check if database exists
if (!fs.existsSync(dbPath)) {
    console.error(`Error: Database not found at ${dbPath}`);
    process.exit(1);
}

// Get database size
const stats = fs.statSync(dbPath);
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log('Database Backup');
console.log('='.repeat(60));
console.log(`Source: ${dbPath}`);
console.log(`Size: ${sizeMB} MB`);
console.log(`Backup: ${backupPath}`);
console.log();

// Copy the database file
try {
    fs.copyFileSync(dbPath, backupPath);
    console.log(`✓ Backup created successfully!`);
    console.log(`  ${backupPath}`);
    console.log();

    // Also copy WAL and SHM files if they exist
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';

    if (fs.existsSync(walPath)) {
        const walBackup = backupPath + '-wal';
        fs.copyFileSync(walPath, walBackup);
        console.log(`✓ WAL file backed up: ${walBackup}`);
    }

    if (fs.existsSync(shmPath)) {
        const shmBackup = backupPath + '-shm';
        fs.copyFileSync(shmPath, shmBackup);
        console.log(`✓ SHM file backed up: ${shmBackup}`);
    }

    console.log();
    console.log('Note: For a clean backup, you may want to run:');
    console.log('  sqlite3 data/neuroqc.db ".backup backups/neuroqc-clean-backup.db"');
    console.log('This creates a backup without WAL files.');

} catch (error) {
    console.error(`✗ Error creating backup:`, error.message);
    process.exit(1);
}

