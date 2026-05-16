<template>
  <div class="profile-view">
    <h2 class="mb-4">Your Profile</h2>

    <div v-if="loading" class="text-center">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else class="row">
      <div class="col-md-4">
        <div class="card">
          <div class="card-body text-center">
            <div class="profile-avatar mb-3">
              <span class="display-1">👤</span>
            </div>
            <h4>{{ profile.username }}</h4>
            <p class="text-muted">{{ authStore.user?.email }}</p>
          </div>
        </div>
      </div>

      <div class="col-md-8">
        <div class="card">
          <div class="card-body">
            <h5 class="card-title">Statistics</h5>
            <div class="row">
              <div class="col-6 mb-3">
                <div class="stat-box">
                  <div class="stat-value">{{ profile.total_score }}</div>
                  <div class="stat-label">Total Score</div>
                </div>
              </div>
              <div class="col-6 mb-3">
                <div class="stat-box">
                  <div class="stat-value">{{ voteCount }}</div>
                  <div class="stat-label">Total Votes</div>
                </div>
              </div>
            </div>

            <h5 class="card-title mt-4">Recent Activity</h5>
            <div class="list-group">
              <div v-for="vote in recentVotes" :key="vote.id" class="list-group-item">
                <div class="d-flex justify-content-between">
                  <span>{{ vote.sample_filename }}</span>
                  <span :class="vote.rating === 1 ? 'text-success' : 'text-danger'">
                    {{ vote.rating === 1 ? '👍 Pass' : '👎 Fail' }}
                  </span>
                </div>
                <small class="text-muted">{{ formatDate(vote.created_at) }}</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../lib/api'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const profile = ref({})
const voteCount = ref(0)
const recentVotes = ref([])
const loading = ref(true)

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
}

async function loadProfile() {
  try {
    // Load user profile
    const userData = await api.getUser()
    profile.value = userData.user

    // Load recent votes
    const votes = await api.getMyVotes()
    voteCount.value = votes.length
    recentVotes.value = votes.slice(0, 10).map(v => ({
      ...v,
      sample_filename: v.filename || 'Unknown'
    }))
  } catch (error) {
    console.error('Error loading profile:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadProfile()
})
</script>

<style scoped>
.stat-box {
  text-align: center;
  padding: 20px;
  background-color: #f8f9fa;
  border-radius: 8px;
}

.stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: #007bff;
}

.stat-label {
  color: #6c757d;
  font-size: 0.9rem;
}
</style>

