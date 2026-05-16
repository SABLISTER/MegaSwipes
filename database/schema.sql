-- CMI NeuroQC Database Schema
-- Child Mind Institute - Neuroimaging Quality Control
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  profile_picture TEXT,
  consent_given BOOLEAN DEFAULT false,
  total_score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Studies table
CREATE TABLE public.studies (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Datasets table
CREATE TABLE public.datasets (
  id SERIAL PRIMARY KEY,
  study_id INTEGER REFERENCES studies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  image_path TEXT NOT NULL,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Samples table
CREATE TABLE public.samples (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  view_count INTEGER DEFAULT 0,
  average_rating FLOAT DEFAULT 0,
  total_votes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(dataset_id, filename)
);

-- Votes table
CREATE TABLE public.votes (
  id SERIAL PRIMARY KEY,
  sample_id INTEGER REFERENCES samples(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating IN (0, 1)),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(sample_id, user_id)
);

-- Tutorials table
CREATE TABLE public.tutorials (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  content JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User tutorials (completion tracking)
CREATE TABLE public.user_tutorials (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tutorial_id INTEGER REFERENCES tutorials(id) ON DELETE CASCADE,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, tutorial_id)
);

-- Dataset tutorials (required tutorials per dataset)
CREATE TABLE public.dataset_tutorials (
  dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
  tutorial_id INTEGER REFERENCES tutorials(id) ON DELETE CASCADE,
  PRIMARY KEY (dataset_id, tutorial_id)
);

-- User dataset access (for restricted datasets)
CREATE TABLE public.user_dataset_access (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  dataset_id INTEGER REFERENCES datasets(id) ON DELETE CASCADE,
  access_granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, dataset_id)
);

-- Create indexes for better performance
CREATE INDEX idx_votes_sample_id ON votes(sample_id);
CREATE INDEX idx_votes_user_id ON votes(user_id);
CREATE INDEX idx_samples_dataset_id ON samples(dataset_id);
CREATE INDEX idx_samples_view_count ON samples(view_count);
CREATE INDEX idx_datasets_study_id ON datasets(study_id);
CREATE INDEX idx_users_total_score ON users(total_score DESC);

-- Function to update sample statistics after a vote
CREATE OR REPLACE FUNCTION update_sample_stats(p_sample_id INTEGER, p_rating INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE samples
  SET 
    view_count = view_count + 1,
    total_votes = total_votes + 1,
    average_rating = (average_rating * total_votes + p_rating) / (total_votes + 1)
  WHERE id = p_sample_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update user score after a vote
CREATE OR REPLACE FUNCTION increment_user_score()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users
  SET total_score = total_score + 1
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update user score when a vote is inserted
CREATE TRIGGER update_user_score_trigger
AFTER INSERT ON votes
FOR EACH ROW
EXECUTE FUNCTION increment_user_score();

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutorials ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tutorials ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_tutorials ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_dataset_access ENABLE ROW LEVEL SECURITY;

-- Users: Users can read all users, but only update their own profile
CREATE POLICY "Users can view all users" ON users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- Studies: Everyone can read studies
CREATE POLICY "Anyone can view studies" ON studies FOR SELECT USING (true);

-- Datasets: Everyone can read public datasets
CREATE POLICY "Anyone can view public datasets" ON datasets FOR SELECT USING (is_public = true);

-- Samples: Everyone can read samples from public datasets
CREATE POLICY "Anyone can view samples from public datasets" ON samples 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM datasets WHERE datasets.id = samples.dataset_id AND datasets.is_public = true
    )
  );

-- Votes: Users can insert their own votes and view all votes
CREATE POLICY "Users can insert own votes" ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view all votes" ON votes FOR SELECT USING (true);

-- Tutorials: Everyone can read tutorials
CREATE POLICY "Anyone can view tutorials" ON tutorials FOR SELECT USING (true);

-- User tutorials: Users can manage their own tutorial completions
CREATE POLICY "Users can view own tutorial completions" ON user_tutorials FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tutorial completions" ON user_tutorials FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Dataset tutorials: Everyone can view required tutorials
CREATE POLICY "Anyone can view dataset tutorials" ON dataset_tutorials FOR SELECT USING (true);

-- User dataset access: Users can view their own access grants
CREATE POLICY "Users can view own dataset access" ON user_dataset_access FOR SELECT USING (auth.uid() = user_id);

-- Insert sample data
INSERT INTO studies (name, description) VALUES
  ('Sample Study', 'A sample neuroimaging study for testing');

INSERT INTO datasets (study_id, name, description, image_path, is_public) VALUES
  (1, 'Sample Dataset', 'Sample brain imaging dataset', '1', true);

-- Note: Add your samples manually or via a script
-- Example:
-- INSERT INTO samples (dataset_id, filename) VALUES
--   (1, 'sample1.png'),
--   (1, 'sample2.png');

