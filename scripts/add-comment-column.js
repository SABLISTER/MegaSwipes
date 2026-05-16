import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'data', 'neuroqc.db');

console.log('🔧 Adding comment column to votes table...\n');

try {
  const db = new Database(dbPath);
  
  // Check if column already exists
  const tableInfo = db.pragma('table_info(votes)');
  const hasCommentColumn = tableInfo.some(col => col.name === 'comment');
  
  if (hasCommentColumn) {
    console.log('✅ Comment column already exists in votes table');
  } else {
    // Add the comment column
    db.exec('ALTER TABLE votes ADD COLUMN comment TEXT');
    console.log('✅ Successfully added comment column to votes table');
  }
  
  // Verify the change
  const updatedTableInfo = db.pragma('table_info(votes)');
  console.log('\n📋 Current votes table structure:');
  updatedTableInfo.forEach(col => {
    console.log(`   - ${col.name} (${col.type})`);
  });
  
  db.close();
  console.log('\n✅ Migration complete!');
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
}
