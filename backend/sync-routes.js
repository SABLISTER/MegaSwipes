import express from 'express';
import syncManager from './sync.js';
import { requireAuth } from './auth.js';

const router = express.Router();

/**
 * Sync API Routes
 * Endpoints for managing hybrid online/offline synchronization
 */

// Initialize sync with Supabase credentials
router.post('/init', requireAuth, async (req, res) => {
  const { supabaseUrl, supabaseKey } = req.body;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(400).json({ 
      error: 'Missing supabaseUrl or supabaseKey' 
    });
  }

  const success = syncManager.initialize(supabaseUrl, supabaseKey);

  if (success) {
    res.json({ 
      success: true, 
      message: 'Sync initialized successfully',
      status: syncManager.getStatus()
    });
  } else {
    res.status(500).json({ 
      error: 'Failed to initialize sync' 
    });
  }
});

// Get sync status
router.get('/status', requireAuth, (req, res) => {
  res.json(syncManager.getStatus());
});

// Trigger full sync
router.post('/sync', requireAuth, async (req, res) => {
  if (!syncManager.isOnline()) {
    return res.status(503).json({ 
      error: 'Sync not available - offline mode or not initialized' 
    });
  }

  try {
    const results = await syncManager.syncAll();
    res.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Sync failed', 
      message: error.message 
    });
  }
});

// Set conflict resolution strategy
router.post('/conflict-resolution', requireAuth, (req, res) => {
  const { strategy } = req.body;

  if (!strategy) {
    return res.status(400).json({ 
      error: 'Missing strategy parameter' 
    });
  }

  const success = syncManager.setConflictResolution(strategy);

  if (success) {
    res.json({ 
      success: true, 
      strategy,
      message: 'Conflict resolution strategy updated'
    });
  } else {
    res.status(400).json({ 
      error: 'Invalid strategy. Must be: server-wins, client-wins, or newest-wins' 
    });
  }
});

// Auto-sync configuration
let autoSyncInterval = null;

router.post('/auto-sync', requireAuth, (req, res) => {
  const { enabled, intervalMinutes } = req.body;

  if (enabled) {
    if (!intervalMinutes || intervalMinutes < 1) {
      return res.status(400).json({ 
        error: 'Invalid interval. Must be at least 1 minute' 
      });
    }

    // Clear existing interval
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
    }

    // Set up new interval
    autoSyncInterval = setInterval(async () => {
      if (syncManager.isOnline()) {
        console.log('🔄 Auto-sync triggered...');
        try {
          await syncManager.syncAll();
        } catch (error) {
          console.error('❌ Auto-sync failed:', error);
        }
      }
    }, intervalMinutes * 60 * 1000);

    res.json({ 
      success: true, 
      message: `Auto-sync enabled (every ${intervalMinutes} minutes)` 
    });
  } else {
    // Disable auto-sync
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }

    res.json({ 
      success: true, 
      message: 'Auto-sync disabled' 
    });
  }
});

export default router;

