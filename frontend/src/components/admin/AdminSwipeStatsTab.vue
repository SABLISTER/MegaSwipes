<template>
  <div class="tab-pane">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="mb-0">Swipe Statistics Dashboard</h5>
      <div class="d-flex align-items-center gap-2">
        <div class="form-check form-switch">
          <input 
            class="form-check-input" 
            type="checkbox" 
            id="autoRefreshToggle"
            v-model="autoRefresh"
            @change="toggleAutoRefresh"
          >
          <label class="form-check-label" for="autoRefreshToggle">
            Auto-refresh ({{ refreshInterval }}s)
          </label>
        </div>
        <button @click="loadStats" class="btn btn-sm btn-outline-primary" :disabled="loading">
          🔄 Refresh
        </button>
        <small class="text-muted">
          Last updated: {{ lastUpdated ? formatTime(lastUpdated) : 'Never' }}
        </small>
      </div>
    </div>

    <div v-if="loading && !stats" class="text-center py-5">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else-if="stats">
      <!-- Overall Statistics Cards -->
      <div class="row mb-4">
        <div class="col-md-3">
          <div class="card text-center border-primary">
            <div class="card-body">
              <h3 class="card-title text-primary">{{ stats.overall?.total_votes || 0 }}</h3>
              <p class="card-text text-muted mb-0">Total Votes</p>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card text-center border-success">
            <div class="card-body">
              <h3 class="card-title text-success">{{ stats.overall?.pass_count || 0 }}</h3>
              <p class="card-text text-muted mb-0">Pass ({{ stats.overall?.pass_percentage || 0 }}%)</p>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card text-center border-danger">
            <div class="card-body">
              <h3 class="card-title text-danger">{{ stats.overall?.fail_count || 0 }}</h3>
              <p class="card-text text-muted mb-0">Fail ({{ stats.overall?.fail_percentage || 0 }}%)</p>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card text-center border-info">
            <div class="card-body">
              <h3 class="card-title text-info">{{ stats.overall?.unique_voters || 0 }}</h3>
              <p class="card-text text-muted mb-0">Unique Voters</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabs for different views -->
      <ul class="nav nav-tabs mb-3" role="tablist">
        <li class="nav-item" role="presentation">
          <button 
            :class="['nav-link', { active: viewTab === 'studies' }]"
            @click="viewTab = 'studies'"
            type="button"
          >
            📚 By Study
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button 
            :class="['nav-link', { active: viewTab === 'datasets' }]"
            @click="viewTab = 'datasets'"
            type="button"
          >
            📁 By Dataset
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button 
            :class="['nav-link', { active: viewTab === 'images' }]"
            @click="viewTab = 'images'"
            type="button"
          >
            🖼️ By Image
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button 
            :class="['nav-link', { active: viewTab === 'recent' }]"
            @click="viewTab = 'recent'"
            type="button"
          >
            ⏰ Recent Activity
          </button>
        </li>
      </ul>

      <!-- Per Study View -->
      <div v-if="viewTab === 'studies'" class="card">
        <div class="card-body">
          <table class="table table-hover table-sm">
            <thead>
              <tr>
                <th>Study</th>
                <th>Datasets</th>
                <th>Images</th>
                <th>Subjects</th>
                <th>Total Votes</th>
                <th>Pass</th>
                <th>Fail</th>
                <th>Pass %</th>
                <th>Voters</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="study in stats.perStudy" :key="study.id">
                <td><strong>{{ study.name }}</strong></td>
                <td>{{ study.dataset_count || 0 }}</td>
                <td>{{ study.total_images || 0 }}</td>
                <td>{{ study.subject_count || 0 }}</td>
                <td>{{ study.total_votes || 0 }}</td>
                <td class="text-success">{{ study.pass_count || 0 }}</td>
                <td class="text-danger">{{ study.fail_count || 0 }}</td>
                <td>
                  <span :class="study.pass_percentage >= 70 ? 'text-success' : study.pass_percentage >= 50 ? 'text-warning' : 'text-danger'">
                    {{ study.pass_percentage || 0 }}%
                  </span>
                </td>
                <td>{{ study.unique_voters || 0 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Per Dataset View -->
      <div v-if="viewTab === 'datasets'" class="card">
        <div class="card-body">
          <table class="table table-hover table-sm">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Study</th>
                <th>Images</th>
                <th>Subjects</th>
                <th>Total Votes</th>
                <th>Pass</th>
                <th>Fail</th>
                <th>Pass %</th>
                <th>Completion</th>
                <th>Voters</th>
                <th>Avg Rating</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="dataset in stats.perDataset" :key="dataset.id">
                <td><strong>{{ dataset.name }}</strong></td>
                <td>{{ dataset.study_name }}</td>
                <td>{{ dataset.total_samples || 0 }}</td>
                <td>{{ dataset.subject_count || 0 }}</td>
                <td>{{ dataset.total_votes || 0 }}</td>
                <td class="text-success">{{ dataset.pass_count || 0 }}</td>
                <td class="text-danger">{{ dataset.fail_count || 0 }}</td>
                <td>
                  <span :class="dataset.pass_percentage >= 70 ? 'text-success' : dataset.pass_percentage >= 50 ? 'text-warning' : 'text-danger'">
                    {{ dataset.pass_percentage || 0 }}%
                  </span>
                </td>
                <td>
                  <div class="progress" style="height: 20px;">
                    <div 
                      class="progress-bar" 
                      :style="{ width: `${dataset.completion_percentage || 0}%` }"
                    >
                      {{ dataset.completion_percentage || 0 }}%
                    </div>
                  </div>
                </td>
                <td>{{ dataset.unique_voters || 0 }}</td>
                <td>{{ dataset.average_rating?.toFixed(3) || 'N/A' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Per Image View -->
      <div v-if="viewTab === 'images'" class="card">
        <div class="card-body">
          <div class="mb-3">
            <input 
              type="text" 
              class="form-control" 
              v-model="imageFilter"
              placeholder="Filter by filename, dataset, or study..."
            >
          </div>
          <div class="table-responsive" style="max-height: 600px; overflow-y: auto;">
            <table class="table table-hover table-sm table-striped">
              <thead class="sticky-top bg-light">
                <tr>
                  <th>Image</th>
                  <th>Dataset</th>
                  <th>Study</th>
                  <th>Votes</th>
                  <th>Pass</th>
                  <th>Fail</th>
                  <th>Pass %</th>
                  <th>Avg Rating</th>
                  <th>Voters</th>
                  <th>Last Voted</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="image in filteredImages" :key="image.id">
                  <td><code>{{ image.filename }}</code></td>
                  <td>{{ image.dataset_name }}</td>
                  <td>{{ image.study_name }}</td>
                  <td><strong>{{ image.vote_count }}</strong></td>
                  <td class="text-success">{{ image.pass_count || 0 }}</td>
                  <td class="text-danger">{{ image.fail_count || 0 }}</td>
                  <td>
                    <span :class="image.pass_percentage >= 70 ? 'text-success' : image.pass_percentage >= 50 ? 'text-warning' : 'text-danger'">
                      {{ image.pass_percentage || 0 }}%
                    </span>
                  </td>
                  <td>{{ image.average_rating?.toFixed(3) || 'N/A' }}</td>
                  <td>{{ image.unique_voters || 0 }}</td>
                  <td><small>{{ formatTime(image.last_voted_at) }}</small></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="filteredImages.length === 0" class="text-center text-muted py-3">
            No images found matching filter
          </div>
        </div>
      </div>

      <!-- Recent Activity View -->
      <div v-if="viewTab === 'recent'" class="card">
        <div class="card-body">
          <div class="table-responsive" style="max-height: 600px; overflow-y: auto;">
            <table class="table table-hover table-sm">
              <thead class="sticky-top bg-light">
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Image</th>
                  <th>Dataset</th>
                  <th>Study</th>
                  <th>Rating</th>
                  <th>Comment</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="vote in stats.recentVotes" :key="vote.id">
                  <td><small>{{ formatTime(vote.created_at) }}</small></td>
                  <td><strong>{{ vote.username }}</strong></td>
                  <td><code>{{ vote.filename }}</code></td>
                  <td>{{ vote.dataset_name }}</td>
                  <td>{{ vote.study_name }}</td>
                  <td>
                    <span :class="vote.rating === 1 ? 'badge bg-success' : 'badge bg-danger'">
                      {{ vote.rating === 1 ? '✓ Pass' : '✗ Fail' }}
                    </span>
                  </td>
                  <td><small class="text-muted">{{ vote.comment || '-' }}</small></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import api from '../../lib/api.js'

const props = defineProps({
  loading: {
    type: Boolean,
    default: false
  }
})

const stats = ref(null)
const loading = ref(false)
const autoRefresh = ref(true)
const refreshInterval = ref(5) // seconds
const lastUpdated = ref(null)
const viewTab = ref('studies')
const imageFilter = ref('')
let refreshTimer = null

const filteredImages = computed(() => {
  if (!stats.value?.perImage) return []
  if (!imageFilter.value) return stats.value.perImage
  
  const filter = imageFilter.value.toLowerCase()
  return stats.value.perImage.filter(img => 
    img.filename.toLowerCase().includes(filter) ||
    img.dataset_name.toLowerCase().includes(filter) ||
    img.study_name.toLowerCase().includes(filter)
  )
})

function formatTime(timestamp) {
  if (!timestamp) return 'N/A'
  const date = new Date(timestamp)
  return date.toLocaleString()
}

async function loadStats() {
  loading.value = true
  try {
    const data = await api.getSwipeStats()
    stats.value = data
    lastUpdated.value = new Date()
  } catch (error) {
    console.error('Error loading swipe stats:', error)
  } finally {
    loading.value = false
  }
}

function toggleAutoRefresh() {
  if (autoRefresh.value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

function startAutoRefresh() {
  stopAutoRefresh() // Clear any existing timer
  refreshTimer = setInterval(() => {
    loadStats()
  }, refreshInterval.value * 1000)
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

onMounted(() => {
  loadStats()
  if (autoRefresh.value) {
    startAutoRefresh()
  }
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<style scoped>
.sticky-top {
  position: sticky;
  top: 0;
  z-index: 10;
}

.card {
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.table-responsive {
  border-radius: 0.375rem;
}
</style>

