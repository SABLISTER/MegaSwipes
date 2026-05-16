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
          <h5 class="mb-0">Dataset Management</h5>
          <button @click="$emit('create-dataset')" class="btn btn-primary">
            ➕ Create Dataset
          </button>
        </div>
        <div class="card-body">
          <table class="table table-hover">
            <thead>
              <tr>
                <th>Name</th>
                <th>Study</th>
                <th>Image Path</th>
                <th>Images</th>
                <th>Subjects</th>
                <th>Votes</th>
                <th>Avg Rating</th>
                <th>Public</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="dataset in datasets" :key="dataset.id">
                <td>{{ dataset.name }}</td>
                <td>{{ dataset.study_name }}</td>
                <td><code>{{ dataset.image_path }}</code></td>
                <td>{{ dataset.sample_count }}</td>
                <td>{{ dataset.subject_count || 'N/A' }}</td>
                <td>{{ dataset.vote_count }}</td>
                <td>{{ dataset.average_rating?.toFixed(2) || 'N/A' }}</td>
                <td>
                  <span :class="dataset.is_public ? 'badge bg-success' : 'badge bg-warning'">
                    {{ dataset.is_public ? 'Public' : 'Private' }}
                  </span>
                </td>
                <td>
                  <button 
                    @click="$emit('edit-dataset', dataset)" 
                    class="btn btn-sm btn-outline-primary me-1"
                    title="Edit Dataset"
                  >
                    ✏️
                  </button>
                  <button 
                    @click="$emit('delete-dataset', dataset)" 
                    class="btn btn-sm btn-outline-danger"
                    title="Delete Dataset"
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
defineProps({
  datasets: {
    type: Array,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
})

defineEmits(['create-dataset', 'edit-dataset', 'delete-dataset'])
</script>

