<template>
  <div class="tab-pane">
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>
    <div v-else>
      <!-- Grant Access Form -->
      <div class="card mb-4">
        <div class="card-header">
          <h5 class="mb-0">Grant Dataset Access</h5>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-5">
              <label class="form-label">User</label>
              <select 
                :value="accessForm.userId" 
                @change="$emit('update:userId', $event.target.value)" 
                class="form-select"
              >
                <option value="">Select User</option>
                <option v-for="user in users" :key="user.id" :value="user.id">
                  {{ user.username }} ({{ user.email }})
                </option>
              </select>
            </div>
            <div class="col-md-5">
              <label class="form-label">Dataset (Private only)</label>
              <select 
                :value="accessForm.datasetId" 
                @change="$emit('update:datasetId', $event.target.value)" 
                class="form-select"
              >
                <option value="">Select Dataset</option>
                <option v-for="ds in privateDatasets" :key="ds.id" :value="ds.id">
                  {{ ds.name }} ({{ ds.is_public ? 'Public' : 'Private' }})
                </option>
              </select>
              <small v-if="privateDatasets.length === 0" class="text-muted">
                No private datasets available. Create a private dataset first.
              </small>
            </div>
            <div class="col-md-2 d-flex align-items-end">
              <button 
                @click="$emit('grant-access')" 
                class="btn btn-primary w-100"
                :disabled="!accessForm.userId || !accessForm.datasetId"
              >
                Grant Access
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Access Grants List -->
      <div class="card">
        <div class="card-header">
          <h5 class="mb-0">Current Access Grants</h5>
        </div>
        <div class="card-body">
          <table class="table table-hover">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Dataset</th>
                <th>Granted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="grant in accessGrants" :key="`${grant.user_id}-${grant.dataset_id}`">
                <td>{{ grant.username }}</td>
                <td>{{ grant.email }}</td>
                <td>{{ grant.dataset_name }}</td>
                <td>{{ formatDate(grant.access_granted_at) }}</td>
                <td>
                  <button 
                    @click="$emit('revoke-access', grant)" 
                    class="btn btn-sm btn-outline-danger"
                    title="Revoke Access"
                  >
                    🗑️ Revoke
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatDate } from '../../composables/useAdmin.js'

const props = defineProps({
  users: {
    type: Array,
    required: true
  },
  datasets: {
    type: Array,
    required: true
  },
  accessGrants: {
    type: Array,
    required: true
  },
  accessForm: {
    type: Object,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update:userId', 'update:datasetId', 'grant-access', 'revoke-access'])

const privateDatasets = computed(() => {
  return props.datasets.filter(d => !d.is_public)
})
</script>

