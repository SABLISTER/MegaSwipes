import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'data', 'neuroqc.db');
const db = new Database(dbPath);

console.log('Checking for duplicates...\n');

// 1. Check for duplicate samples (same filename in same dataset)
const duplicateSamples = db.prepare(`
  SELECT dataset_id, filename, COUNT(*) as count
  FROM samples
  GROUP BY dataset_id, filename
  HAVING count > 1
`).all();

console.log(`Found ${duplicateSamples.length} duplicate samples (same filename in same dataset).`);
if (duplicateSamples.length > 0) console.table(duplicateSamples);

// 2. Check for duplicate votes (same user, same sample_id)
// Note: The UNIQUE constraint should prevent this, but checking anyway.
const duplicateVotesExact = db.prepare(`
  SELECT user_id, sample_id, COUNT(*) as count
  FROM votes
  GROUP BY user_id, sample_id
  HAVING count > 1
`).all();

console.log(`Found ${duplicateVotesExact.length} duplicate votes (same user, same sample_id).`);
if (duplicateVotesExact.length > 0) console.table(duplicateVotesExact);

// 3. Check for "effective" duplicate votes (same user, same filename, different sample_id)
// This would happen if we have duplicate samples and the user voted on both.
const duplicateVotesFilename = db.prepare(`
  SELECT v.user_id, s.filename, COUNT(*) as count
  FROM votes v
  JOIN samples s ON v.sample_id = s.id
  GROUP BY v.user_id, s.filename
  HAVING count > 1
`).all();

console.log(`Found ${duplicateVotesFilename.length} effective duplicate votes (same user, same filename).`);
if (duplicateVotesFilename.length > 0) {
    console.table(duplicateVotesFilename);

    // Detailed view of one example if exists
    const example = duplicateVotesFilename[0];
    const details = db.prepare(`
        SELECT v.id as vote_id, v.user_id, v.sample_id, s.filename, v.created_at
        FROM votes v
        JOIN samples s ON v.sample_id = s.id
        WHERE v.user_id = ? AND s.filename = ?
    `).all(example.user_id, example.filename);
    console.log('\nExample details:');
    console.table(details);
}

db.close();
