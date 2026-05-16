-- Migration script to add secure tokens and file paths to samples table
-- Run this with: sqlite3 data/neuroqc.db < scripts/add-secure-tokens.sql

-- Add secure_token column if it doesn't exist
ALTER TABLE samples ADD COLUMN secure_token TEXT UNIQUE;

-- Add file_path column if it doesn't exist  
ALTER TABLE samples ADD COLUMN file_path TEXT;

-- Create index on secure_token for fast lookups
CREATE INDEX IF NOT EXISTS idx_samples_secure_token ON samples(secure_token);

-- Note: You'll need to run the Node.js script to populate the tokens and file paths
-- Or manually update them with:
-- UPDATE samples SET 
--   secure_token = lower(hex(randomblob(16))),
--   file_path = (SELECT image_path FROM datasets WHERE id = samples.dataset_id) || '/' || filename
-- WHERE secure_token IS NULL;
