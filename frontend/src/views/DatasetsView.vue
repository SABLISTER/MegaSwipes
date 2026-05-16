<template>
  <div class="datasets-view">
    <h2 class="mb-4">Available Datasets</h2>

    <div v-if="loading" class="text-center">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else-if="datasets.length === 0" class="alert alert-info">
      No datasets available yet.
    </div>

    <div v-else class="row">
      <div v-for="dataset in datasets" :key="dataset.id" class="col-md-6 col-lg-4 mb-4">
        <div class="card h-100">
          <div class="card-body">
            <h5 class="card-title">{{ dataset.name }}</h5>
            <p class="card-text">{{ dataset.description || 'No description available' }}</p>
            <div class="dataset-stats mb-3">
              <small class="text-muted">
                <strong>Study:</strong> {{ dataset.study_name }}<br>
                <strong>Samples:</strong> {{ dataset.sample_count || 0 }}<br>
                <strong>Type:</strong> {{ dataset.is_public ? 'Public' : 'Restricted' }}
              </small>
            </div>
          </div>
          <div class="card-footer">
            <router-link
              :to="`/swipe/${dataset.id}`"
              class="btn btn-primary w-100"
            >
              Start Swiping
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../lib/api'

const datasets = ref([])
const loading = ref(true)

async function loadDatasets() {
  try {
    const data = await api.getDatasets()
    datasets.value = data
  } catch (error) {
    console.error('Error loading datasets:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadDatasets()
})
</script>

<style scoped>
.card {
  transition: transform 0.2s;
}

.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
</style>

