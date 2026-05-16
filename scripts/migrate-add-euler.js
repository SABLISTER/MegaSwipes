
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Correct path to database based on project structure
// scripts/ -> root/ -> data/
const dbPath = join(__dirname, '..', 'data', 'neuroqc.db');

if (!existsSync(dbPath)) {
    console.error(`❌ Database not found at: ${dbPath}`);
    process.exit(1);
}

const db = new Database(dbPath);

console.log('🔄 Checking for euler_number column...');

try {
    // Check if column exists
    const tableInfo = db.pragma('table_info(samples)');
    const hasColumn = tableInfo.some(col => col.name === 'euler_number');

    if (hasColumn) {
        console.log('✅ Column euler_number already exists.');
    } else {
        console.log('➕ Adding euler_number column to samples table...');
        db.prepare('ALTER TABLE samples ADD COLUMN euler_number REAL').run();
        console.log('✅ Column added successfully.');
    }
} catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
} finally {
    db.close();
}
