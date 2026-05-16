import { createClient } from '@supabase/supabase-js';
import db from './database.js';

/**
 * Hybrid Sync Module
 * Synchronizes data between local SQLite and cloud Supabase
 * Supports offline-first with online sync capabilities
 */

class SyncManager {
  constructor() {
    this.supabase = null;
    this.syncEnabled = false;
    this.lastSyncTime = null;
    this.conflictResolution = 'server-wins'; // 'server-wins', 'client-wins', 'newest-wins'
  }

  /**
   * Initialize Supabase connection for syncing
   */
  initialize(supabaseUrl, supabaseKey) {
    if (!supabaseUrl || !supabaseKey) {
      console.log('⚠️  Sync disabled: No Supabase credentials provided');
      return false;
    }

    try {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      this.syncEnabled = true;
      console.log('✅ Sync enabled: Connected to Supabase');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize sync:', error);
      return false;
    }
  }

  /**
   * Check if sync is available
   */
  isOnline() {
    return this.syncEnabled && this.supabase !== null;
  }

  /**
   * Full bidirectional sync
   */
  async syncAll() {
    if (!this.isOnline()) {
      console.log('⚠️  Sync skipped: Offline mode');
      return { success: false, error: 'Offline mode' };
    }

    console.log('🔄 Starting full sync...');
    const results = {
      users: await this.syncUsers(),
      studies: await this.syncStudies(),
      datasets: await this.syncDatasets(),
      samples: await this.syncSamples(),
      votes: await this.syncVotes(),
    };

    this.lastSyncTime = new Date().toISOString();
    
    console.log('✅ Sync complete:', results);
    return results;
  }

  /**
   * Sync users table
   */
  async syncUsers() {
    try {
      // Get local users with their last update time
      const localUsers = db.prepare(`
        SELECT * FROM users 
        WHERE updated_at > COALESCE(?, '1970-01-01')
      `).all(this.lastSyncTime || '1970-01-01');

      // Get remote users updated since last sync
      const { data: remoteUsers, error } = await this.supabase
        .from('users')
        .select('*')
        .gt('updated_at', this.lastSyncTime || '1970-01-01');

      if (error) throw error;

      let uploaded = 0;
      let downloaded = 0;
      let conflicts = 0;

      // Upload local changes to Supabase
      for (const user of localUsers) {
        const { error: upsertError } = await this.supabase
          .from('users')
          .upsert({
            id: user.id,
            username: user.username,
            email: user.email,
            total_score: user.total_score,
            consent_given: user.consent_given === 1,
            created_at: user.created_at,
            updated_at: user.updated_at,
          }, {
            onConflict: 'id',
            ignoreDuplicates: false
          });

        if (!upsertError) uploaded++;
      }

      // Download remote changes to SQLite
      for (const user of remoteUsers || []) {
        const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        
        if (existing && existing.updated_at > user.updated_at) {
          // Local is newer - conflict
          conflicts++;
          if (this.conflictResolution === 'server-wins') {
            this.updateLocalUser(user);
            downloaded++;
          }
        } else {
          // Remote is newer or doesn't exist locally
          this.updateLocalUser(user);
          downloaded++;
        }
      }

      return { uploaded, downloaded, conflicts };
    } catch (error) {
      console.error('Error syncing users:', error);
      return { error: error.message };
    }
  }

  /**
   * Sync studies table
   */
  async syncStudies() {
    try {
      const localStudies = db.prepare(`
        SELECT * FROM studies 
        WHERE updated_at > COALESCE(?, '1970-01-01')
      `).all(this.lastSyncTime || '1970-01-01');

      const { data: remoteStudies, error } = await this.supabase
        .from('studies')
        .select('*')
        .gt('updated_at', this.lastSyncTime || '1970-01-01');

      if (error) throw error;

      let uploaded = 0;
      let downloaded = 0;

      // Upload local changes
      for (const study of localStudies) {
        const { error: upsertError } = await this.supabase
          .from('studies')
          .upsert(study, { onConflict: 'id' });

        if (!upsertError) uploaded++;
      }

      // Download remote changes
      for (const study of remoteStudies || []) {
        db.prepare(`
          INSERT OR REPLACE INTO studies (id, name, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(study.id, study.name, study.description, study.created_at, study.updated_at);
        downloaded++;
      }

      return { uploaded, downloaded };
    } catch (error) {
      console.error('Error syncing studies:', error);
      return { error: error.message };
    }
  }

  /**
   * Sync datasets table
   */
  async syncDatasets() {
    try {
      const localDatasets = db.prepare(`
        SELECT * FROM datasets 
        WHERE updated_at > COALESCE(?, '1970-01-01')
      `).all(this.lastSyncTime || '1970-01-01');

      const { data: remoteDatasets, error } = await this.supabase
        .from('datasets')
        .select('*')
        .gt('updated_at', this.lastSyncTime || '1970-01-01');

      if (error) throw error;

      let uploaded = 0;
      let downloaded = 0;

      // Upload local changes
      for (const dataset of localDatasets) {
        const { error: upsertError } = await this.supabase
          .from('datasets')
          .upsert({
            ...dataset,
            is_public: dataset.is_public === 1
          }, { onConflict: 'id' });

        if (!upsertError) uploaded++;
      }

      // Download remote changes
      for (const dataset of remoteDatasets || []) {
        db.prepare(`
          INSERT OR REPLACE INTO datasets 
          (id, study_id, name, description, image_path, is_public, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          dataset.id,
          dataset.study_id,
          dataset.name,
          dataset.description,
          dataset.image_path,
          dataset.is_public ? 1 : 0,
          dataset.created_at,
          dataset.updated_at
        );
        downloaded++;
      }

      return { uploaded, downloaded };
    } catch (error) {
      console.error('Error syncing datasets:', error);
      return { error: error.message };
    }
  }

  /**
   * Sync samples table
   */
  async syncSamples() {
    try {
      const localSamples = db.prepare(`
        SELECT * FROM samples 
        WHERE updated_at > COALESCE(?, '1970-01-01')
      `).all(this.lastSyncTime || '1970-01-01');

      const { data: remoteSamples, error } = await this.supabase
        .from('samples')
        .select('*')
        .gt('updated_at', this.lastSyncTime || '1970-01-01');

      if (error) throw error;

      let uploaded = 0;
      let downloaded = 0;

      // Upload local changes
      for (const sample of localSamples) {
        const { error: upsertError } = await this.supabase
          .from('samples')
          .upsert(sample, { onConflict: 'id' });

        if (!upsertError) uploaded++;
      }

      // Download remote changes
      for (const sample of remoteSamples || []) {
        db.prepare(`
          INSERT OR REPLACE INTO samples 
          (id, dataset_id, filename, view_count, vote_count, average_rating, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sample.id,
          sample.dataset_id,
          sample.filename,
          sample.view_count || 0,
          sample.vote_count || 0,
          sample.average_rating,
          sample.created_at,
          sample.updated_at
        );
        downloaded++;
      }

      return { uploaded, downloaded };
    } catch (error) {
      console.error('Error syncing samples:', error);
      return { error: error.message };
    }
  }

  /**
   * Sync votes table
   */
  async syncVotes() {
    try {
      const localVotes = db.prepare(`
        SELECT * FROM votes 
        WHERE updated_at > COALESCE(?, '1970-01-01')
      `).all(this.lastSyncTime || '1970-01-01');

      const { data: remoteVotes, error } = await this.supabase
        .from('votes')
        .select('*')
        .gt('updated_at', this.lastSyncTime || '1970-01-01');

      if (error) throw error;

      let uploaded = 0;
      let downloaded = 0;

      // Upload local changes
      for (const vote of localVotes) {
        const { error: upsertError } = await this.supabase
          .from('votes')
          .upsert({
            id: vote.id,
            user_id: vote.user_id,
            sample_id: vote.sample_id,
            vote: vote.vote,
            rating: vote.rating,
            comment: vote.comment,
            created_at: vote.created_at,
            updated_at: vote.updated_at
          }, { onConflict: 'id' });

        if (!upsertError) uploaded++;
      }

      // Download remote changes
      for (const vote of remoteVotes || []) {
        db.prepare(`
          INSERT OR REPLACE INTO votes 
          (id, user_id, sample_id, vote, rating, comment, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          vote.id,
          vote.user_id,
          vote.sample_id,
          vote.vote,
          vote.rating,
          vote.comment,
          vote.created_at,
          vote.updated_at
        );
        downloaded++;
      }

      return { uploaded, downloaded };
    } catch (error) {
      console.error('Error syncing votes:', error);
      return { error: error.message };
    }
  }

  /**
   * Helper: Update local user from remote data
   */
  updateLocalUser(user) {
    // Don't sync password_hash from Supabase (security)
    db.prepare(`
      UPDATE users 
      SET username = ?, 
          email = ?, 
          total_score = ?, 
          consent_given = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      user.username,
      user.email,
      user.total_score,
      user.consent_given ? 1 : 0,
      user.updated_at,
      user.id
    );
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      enabled: this.syncEnabled,
      online: this.isOnline(),
      lastSync: this.lastSyncTime,
      conflictResolution: this.conflictResolution
    };
  }

  /**
   * Set conflict resolution strategy
   */
  setConflictResolution(strategy) {
    if (['server-wins', 'client-wins', 'newest-wins'].includes(strategy)) {
      this.conflictResolution = strategy;
      return true;
    }
    return false;
  }
}

// Export singleton instance
const syncManager = new SyncManager();
export default syncManager;

