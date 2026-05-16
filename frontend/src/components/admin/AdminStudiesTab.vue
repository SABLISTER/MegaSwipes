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
          <h5 class="mb-0">Study Management</h5>
          <button @click="$emit('create-study')" class="btn btn-primary">
            ➕ Create Study
          </button>
        </div>
        <div class="card-body">
          <table class="table table-hover">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Datasets</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="study in studies" :key="study.id">
                <td>{{ study.name }}</td>
                <td>{{ study.description || 'N/A' }}</td>
                <td>{{ study.dataset_count }}</td>
                <td>{{ formatDate(study.created_at) }}</td>
                <td>
                  <button 
                    @click="$emit('edit-study', study)" 
                    class="btn btn-sm btn-outline-primary me-1"
                    title="Edit Study"
                  >
                    ✏️
                  </button>
                  <button 
                    @click="$emit('delete-study', study)" 
                    class="btn btn-sm btn-outline-danger"
                    title="Delete Study"
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
import { formatDate } from '../../composables/useAdmin.js'

defineProps({
  studies: {
    type: Array,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
})

defineEmits(['create-study', 'edit-study', 'delete-study'])
</script>

