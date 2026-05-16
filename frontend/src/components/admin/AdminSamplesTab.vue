<template>
  <div class="tab-pane">
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>
    <div v-else>
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h5 class="mb-0">Sample Management</h5>
          <div class="d-flex gap-2">
            <select 
              v-model="localDatasetId" 
              @change="$emit('filter-change', $event.target.value)" 
              class="form-select" 
              style="width: 200px;"
            >
              <option value="">All Datasets</option>
              <option v-for="ds in datasets" :key="ds.id" :value="ds.id">
                {{ ds.name }}
              </option>
            </select>
            <button @click="$emit('bulk-import')" class="btn btn-primary">
              📥 Bulk Import
            </button>
          </div>
        </div>
        <div class="card-body">
          <table class="table table-hover">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Dataset</th>
                <th>Votes</th>
                <th>Avg Rating</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sample in samples" :key="sample.id">
                <td>{{ sample.filename }}</td>
                <td>{{ sample.dataset_name }}</td>
                <td>{{ sample.vote_count }}</td>
                <td>{{ sample.average_rating?.toFixed(2) || 'N/A' }}</td>
                <td>{{ formatDate(sample.created_at) }}</td>
                <td>
                  <button 
                    @click="$emit('delete-sample', sample)" 
                    class="btn btn-sm btn-outline-danger"
                    title="Delete Sample"
                  >
                    🗑️
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
import { ref, watch } from 'vue'
import { formatDate } from '../../composables/useAdmin.js'

const props = defineProps({
  samples: {
    type: Array,
    required: true
  },
  datasets: {
    type: Array,
    default: () => []
  },
  selectedDatasetId: {
    type: String,
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['filter-change', 'bulk-import', 'delete-sample'])

const localDatasetId = ref(props.selectedDatasetId)

watch(() => props.selectedDatasetId, (newVal) => {
  localDatasetId.value = newVal
})
</script>

