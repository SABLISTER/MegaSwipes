import db from './backend/database.js';

const ds = db.prepare('SELECT * FROM datasets WHERE name = ?').get('TestDS');
if (!ds) {
    console.error('TestDS not found!');
    process.exit(1);
}
console.log('Dataset found:', ds);

const samples = db.prepare('SELECT * FROM samples WHERE dataset_id = ?').all(ds.id);
console.log(`Found ${samples.length} samples.`);
samples.forEach(s => console.log(`- ${s.file_path}`));

if (samples.length !== 1) console.error('Expected 1 sample!');
if (!samples[0].file_path.includes('SiteA')) console.error('Expected sample from SiteA!');
if (samples.some(s => s.file_path.includes('SiteB'))) console.error('Found sample from SiteB!');
