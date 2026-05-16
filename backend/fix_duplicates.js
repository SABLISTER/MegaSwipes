import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'data', 'neuroqc.db');
const db = new Database(dbPath);

console.log('🔧 Starting deduplication and index fix...\n');

// Enable foreign keys
db.pragma('foreign_keys = ON');

const fixDuplicates = db.transaction(() => {
    // 1. Find all duplicate groups
    const duplicates = db.prepare(`
    SELECT dataset_id, filename, COUNT(*) as count
    FROM samples
    GROUP BY dataset_id, filename
    HAVING count > 1
  `).all();

    console.log(`Found ${duplicates.length} groups of duplicate samples.`);

    let totalMergedVotes = 0;
    let totalDeletedSamples = 0;

    for (const dup of duplicates) {
        // Get all samples for this filename/dataset
        const samples = db.prepare(`
      SELECT id, vote_count, created_at
      FROM samples
      WHERE dataset_id = ? AND filename = ?
      ORDER BY created_at ASC
    `).all(dup.dataset_id, dup.filename);

        // First one is master, others are duplicates to be merged/deleted
        const masterSample = samples[0];
        const duplicateSamples = samples.slice(1);

        console.log(`Processing ${dup.filename} (Master ID: ${masterSample.id}, Duplicates: ${duplicateSamples.length})`);

        for (const dupSample of duplicateSamples) {
            // Get votes for this duplicate sample
            const votes = db.prepare('SELECT * FROM votes WHERE sample_id = ?').all(dupSample.id);

            for (const vote of votes) {
                // Check if user already voted on master sample
                const existingMasterVote = db.prepare(`
          SELECT id FROM votes WHERE user_id = ? AND sample_id = ?
        `).get(vote.user_id, masterSample.id);

                if (existingMasterVote) {
                    // User voted on both. Keep the most recent one
                    // If we wanted to be smarter, we'd compare timestamps.
                    // Let's compare timestamps.
                    const masterVoteFull = db.prepare('SELECT * FROM votes WHERE id = ?').get(existingMasterVote.id);

                    if (new Date(vote.created_at) > new Date(masterVoteFull.created_at)) {
                        // Duplicate vote is newer, update master with its values
                        db.prepare(`
                   UPDATE votes 
                   SET rating = ?, comment = ?, created_at = ?
                   WHERE id = ?
               `).run(vote.rating, vote.comment, vote.created_at, existingMasterVote.id);
                        console.log(`   Updated master vote for user ${vote.user_id} (newer duplicate found)`);
                    }

                    // Delete the vote on the duplicate sample
                    db.prepare('DELETE FROM votes WHERE id = ?').run(vote.id);

                } else {
                    // User hasn't voted on master. Move vote to master.
                    db.prepare(`
            UPDATE votes SET sample_id = ? WHERE id = ?
          `).run(masterSample.id, vote.id);
                    totalMergedVotes++;
                }
            }

            // Delete the duplicate sample
            db.prepare('DELETE FROM samples WHERE id = ?').run(dupSample.id);
            totalDeletedSamples++;
        }

        // Update stats for master sample
        db.prepare(`
        UPDATE samples
        SET 
          vote_count = (SELECT COUNT(*) FROM votes WHERE sample_id = ?),
          average_rating = (SELECT AVG(rating) FROM votes WHERE sample_id = ? AND rating IS NOT NULL)
        WHERE id = ?
    `).run(masterSample.id, masterSample.id, masterSample.id);
    }

    console.log(`\n✅ Deduplication complete.`);
    console.log(`   Merged Votes: ${totalMergedVotes}`);
    console.log(`   Deleted Samples: ${totalDeletedSamples}`);

    // 2. Create the unique index
    console.log('\nCreating unique index...');
    try {
        db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_samples_dataset_filename 
        ON samples(dataset_id, filename);
      `);
        console.log('✅ Index created successfully.');
    } catch (err) {
        console.error('❌ Failed to create index:', err.message);
        throw err; // Rollback transaction
    }
});

try {
    fixDuplicates();
} catch (err) {
    console.error('\n❌ Script failed. Transaction rolled back.');
    console.error(err);
    process.exit(1);
}

db.close();
