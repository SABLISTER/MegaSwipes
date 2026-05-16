import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '..', 'data', 'neuroqc.db');
const db = new Database(dbPath);

console.log('| User ID | Username | Filename | Time | Vote | Rating | Comment | First/Duplicate |');
console.log('|---|---|---|---|---|---|---|---|');

// 1. Find all duplicate groups of samples
const duplicateGroups = db.prepare(`
  SELECT dataset_id, filename
  FROM samples
  GROUP BY dataset_id, filename
  HAVING COUNT(*) > 1
`).all();

for (const group of duplicateGroups) {
    // 2. Get all sample IDs for this filename
    const samples = db.prepare(`
    SELECT id FROM samples 
    WHERE dataset_id = ? AND filename = ?
  `).all(group.dataset_id, group.filename);

    const sampleIds = samples.map(s => s.id);

    if (sampleIds.length === 0) continue;

    // 3. Find users who voted on ANY of these samples
    // We want users who have > 1 vote across these sample IDs
    const placeholders = sampleIds.map(() => '?').join(',');

    const doubleVoters = db.prepare(`
    SELECT user_id, COUNT(*) as count
    FROM votes
    WHERE sample_id IN (${placeholders})
    GROUP BY user_id
    HAVING count > 1
  `).all(...sampleIds);

    for (const voter of doubleVoters) {
        // 4. Get details of their votes
        const votes = db.prepare(`
      SELECT v.*, u.username
      FROM votes v
      JOIN users u ON v.user_id = u.id
      WHERE v.user_id = ? AND v.sample_id IN (${placeholders})
      ORDER BY v.created_at ASC
    `).all(voter.user_id, ...sampleIds);

        // 5. Output
        votes.forEach((vote, index) => {
            const type = index === 0 ? 'First' : 'Duplicate';
            // Sanitize for markdown table
            const comment = (vote.comment || '').replace(/\n/g, ' ').replace(/\|/g, '-');
            console.log(`| ${vote.user_id} | ${vote.username} | ${group.filename} | ${vote.created_at} | ${vote.vote} | ${vote.rating} | ${comment} | ${type} |`);
        });
    }
}

db.close();
