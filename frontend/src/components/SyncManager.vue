m<template>
  <div class="sync-manager">
    <div class="card">
      <div class="card-body">
        <h5 class="card-title">
          <span class="me-2">🔄</span>
          Hybrid Sync Manager
        </h5>
        <p class="text-muted">
          Sync your local data with Supabase cloud for online/offline hybrid operation
        </p>

        <!-- Sync Status -->
        <div class="sync-status mb-4">
          <div class="d-flex align-items-center mb-2">
            <span class="status-indicator" :class="statusClass"></span>
            <strong class="ms-2">Status:</strong>
            <span class="ms-2">{{ statusText }}</span>
          </div>
          <div v-if="status.lastSync" class="text-muted small">
            Last sync: {{ formatDate(status.lastSync) }}
          </div>
        </div>

        <!-- Configuration -->
        <div v-if="!status.enabled" class="config-section mb-4">
          <h6>Configure Sync</h6>
          <div class="mb-3">
            <label class="form-label">Supabase URL</label>
            <input
              type="url"
              class="form-control"
              v-model="supabaseUrl"
              placeholder="https://your-project.supabase.co"
            >
          </div>
          <div class="mb-3">
            <label class="form-label">Supabase Anon Key</label>
            <input
              type="password"
              class="form-control"
              v-model="supabaseKey"
              placeholder="Your Supabase anon key"
            >
          </div>
          <button
            class="btn btn-primary"
            @click="initializeSync"
            :disabled="!supabaseUrl || !supabaseKey || initializing"
          >
            <span v-if="initializing" class="spinner-border spinner-border-sm me-2"></span>
            {{ initializing ? 'Initializing...' : 'Initialize Sync' }}
          </button>
        </div>

        <!-- Sync Controls -->
        <div v-else class="sync-controls">
          <div class="row mb-3">
            <div class="col-md-6">
              <button
                class="btn btn-success w-100"
                @click="triggerSync"
                :disabled="syncing || !status.online"
              >
                <span v-if="syncing" class="spinner-border spinner-border-sm me-2"></span>
                {{ syncing ? 'Syncing...' : 'Sync Now' }}
              </button>
            </div>
            <div class="col-md-6">
              <select
                class="form-select"
                v-model="conflictResolution"
                @change="updateConflictResolution"
              >
                <option value="server-wins">Server Wins</option>
                <option value="client-wins">Client Wins</option>
                <option value="newest-wins">Newest Wins</option>
              </select>
            </div>
          </div>

          <!-- Auto-sync -->
          <div class="auto-sync mb-3">
            <div class="form-check form-switch">
              <input
                class="form-check-input"
                type="checkbox"
                id="autoSyncToggle"
                v-model="autoSyncEnabled"
                @change="toggleAutoSync"
              >
              <label class="form-check-label" for="autoSyncToggle">
                Auto-sync every
                <input
                  type="number"
                  class="form-control form-control-sm d-inline-block mx-2"
                  style="width: 80px"
                  v-model.number="autoSyncInterval"
                  min="1"
                  max="1440"
                  :disabled="!autoSyncEnabled"
                >
                minutes
              </label>
            </div>
          </div>

          <!-- Sync Results -->
          <div v-if="lastSyncResults" class="sync-results">
            <h6>Last Sync Results</h6>
            <div class="table-responsive">
              <table class="table table-sm">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>↑ Uploaded</th>
                    <th>↓ Downloaded</th>
                    <th>⚠️ Conflicts</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(result, table) in lastSyncResults" :key="table">
                    <td>{{ table }}</td>
                    <td>{{ result.uploaded || 0 }}</td>
                    <td>{{ result.downloaded || 0 }}</td>
                    <td>{{ result.conflicts || 0 }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Error Display -->
        <div v-if="error" class="alert alert-danger mt-3">
          {{ error }}
        </div>

        <!-- Success Message -->
        <div v-if="successMessage" class="alert alert-success mt-3">
          {{ successMessage }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import api from '../lib/api';

const status = ref({
  enabled: false,
  online: false,
  lastSync: null,
  conflictResolution: 'server-wins'
});

const supabaseUrl = ref('');
const supabaseKey = ref('');
const initializing = ref(false);
const syncing = ref(false);
const error = ref(null);
const successMessage = ref(null);
const lastSyncResults = ref(null);
const conflictResolution = ref('server-wins');
const autoSyncEnabled = ref(false);
const autoSyncInterval = ref(15); // minutes

const statusClass = computed(() => {
  if (!status.value.enabled) return 'bg-secondary';
  if (status.value.online) return 'bg-success';
  return 'bg-warning';
});

const statusText = computed(() => {
  if (!status.value.enabled) return 'Not configured';
  if (status.value.online) return 'Online & Ready';
  return 'Offline mode';
});

async function loadStatus() {
  try {
    const data = await api.getSyncStatus();
    status.value = data;
    conflictResolution.value = data.conflictResolution || 'server-wins';
  } catch (err) {
    console.error('Failed to load sync status:', err);
  }
}

async function initializeSync() {
  initializing.value = true;
  error.value = null;
  successMessage.value = null;

  try {
    const result = await api.initializeSync(supabaseUrl.value, supabaseKey.value);
    status.value = result.status;
    successMessage.value = 'Sync initialized successfully!';
    
    // Clear credentials from form
    supabaseUrl.value = '';
    supabaseKey.value = '';
  } catch (err) {
    error.value = err.message || 'Failed to initialize sync';
  } finally {
    initializing.value = false;
  }
}

async function triggerSync() {
  syncing.value = true;
  error.value = null;
  successMessage.value = null;

  try {
    const result = await api.triggerSync();
    lastSyncResults.value = result.results;
    status.value.lastSync = result.timestamp;
    successMessage.value = 'Sync completed successfully!';
  } catch (err) {
    error.value = err.message || 'Sync failed';
  } finally {
    syncing.value = false;
  }
}

async function updateConflictResolution() {
  try {
    await api.setConflictResolution(conflictResolution.value);
    status.value.conflictResolution = conflictResolution.value;
  } catch (err) {
    error.value = 'Failed to update conflict resolution strategy';
  }
}

async function toggleAutoSync() {
  try {
    await api.setAutoSync(autoSyncEnabled.value, autoSyncInterval.value);
    successMessage.value = autoSyncEnabled.value 
      ? `Auto-sync enabled (every ${autoSyncInterval.value} minutes)`
      : 'Auto-sync disabled';
  } catch (err) {
    error.value = 'Failed to update auto-sync settings';
    autoSyncEnabled.value = !autoSyncEnabled.value; // Revert
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

onMounted(() => {
  loadStatus();
});
</script>

<style scoped>
.sync-manager {
  max-width: 800px;
  margin: 0 auto;
}

.status-indicator {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.sync-results {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #dee2e6;
}

.form-control-sm.d-inline-block {
  vertical-align: middle;
}
</style>

