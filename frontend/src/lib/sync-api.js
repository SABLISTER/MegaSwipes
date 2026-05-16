/**
 * Sync API Methods
 * Add these to your existing api.js file
 */

// Dynamically determine API URL based on current hostname
function getApiUrl() {
  // Use environment variable if set
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Detect hostname from current location
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
  
  // Use current hostname (works for both localhost and megaswipes domain)
  // If accessing via megaswipes:5173, API will be megaswipes:3000
  // If accessing via localhost:5173, API will be localhost:3000
  return `${protocol}//${hostname}:3000/api`;
}

const API_URL = getApiUrl();

// Get sync status
export async function getSyncStatus() {
  const response = await fetch(`${API_URL}/sync/status`, {
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get sync status');
  }

  return response.json();
}

// Initialize sync with Supabase
export async function initializeSync(supabaseUrl, supabaseKey) {
  const response = await fetch(`${API_URL}/sync/init`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({ supabaseUrl, supabaseKey })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to initialize sync');
  }

  return response.json();
}

// Trigger manual sync
export async function triggerSync() {
  const response = await fetch(`${API_URL}/sync/sync`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Sync failed');
  }

  return response.json();
}

// Set conflict resolution strategy
export async function setConflictResolution(strategy) {
  const response = await fetch(`${API_URL}/sync/conflict-resolution`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({ strategy })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to set conflict resolution');
  }

  return response.json();
}

// Configure auto-sync
export async function setAutoSync(enabled, intervalMinutes) {
  const response = await fetch(`${API_URL}/sync/auto-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({ enabled, intervalMinutes })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to configure auto-sync');
  }

  return response.json();
}

// Helper to get token
function getToken() {
  return localStorage.getItem('token');
}

