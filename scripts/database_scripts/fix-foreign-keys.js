import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'data', 'neuroqc.db');

console.log('🔧 Fixing foreign key constraints...\n');

// Backup the old database
const backupPath = dbPath + '.backup-' + Date.now();
console.log(`📦 Creating backup: ${backupPath}`);
fs.copyFileSync(dbPath, backupPath);

const db = new Database(dbPath);

// Check current foreign key status
console.log('\n🔍 Checking foreign key constraints...');
const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
if (fkCheck.length > 0) {
  console.log('⚠️  Foreign key violations found:');
  console.log(fkCheck);
} else {
  console.log('✅ No foreign key violations');
}

// Enable foreign keys
db.pragma('foreign_keys = ON');
console.log('✅ Foreign keys enabled');

// Check if foreign keys are actually enabled
const fkEnabled = db.pragma('foreign_keys', { simple: true });
console.log(`Foreign keys status: ${fkEnabled ? 'ON' : 'OFF'}`);

console.log('\n✅ Foreign key fix complete!');
console.log('If you still have issues, you may need to reinitialize the database:');
console.log('  1. Stop the backend server');
console.log('  2. Delete data/neuroqc.db');
console.log('  3. Run: npm run init-db');
console.log('  4. Restart the backend server\n');

db.close();
