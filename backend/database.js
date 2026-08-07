import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataDir = join(__dirname, '..', 'data');
// Ensure the data directory exists so opening the SQLite file cannot fail on fresh clones
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, 'neuroqc.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better concurrency
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

console.log('📁 Database connected:', dbPath);

export default db;
