#!/usr/bin/env node

import db from '../backend/database.js';

console.log('Verifying QC Study Datasets...\n');

const datasets = db.prepare(`
  SELECT d.id, d.name, d.is_public, s.name as study_name 
  FROM datasets d 
  JOIN studies s ON d.study_id = s.id 
  WHERE s.name = 'QC'
`).all();

console.log('QC Study Datasets:');
datasets.forEach(d => {
  console.log(`  ${d.name} (ID: ${d.id}) - ${d.is_public ? 'PUBLIC' : 'PRIVATE'}`);
});

const counts = db.prepare(`
  SELECT d.name, COUNT(s.id) as count 
  FROM datasets d 
  LEFT JOIN samples s ON d.id = s.dataset_id 
  WHERE d.study_id = (SELECT id FROM studies WHERE name = 'QC') 
  GROUP BY d.id, d.name
`).all();

console.log('\nSample counts:');
counts.forEach(c => {
  console.log(`  ${c.name}: ${c.count} samples`);
});

console.log('\n✓ Verification complete');

