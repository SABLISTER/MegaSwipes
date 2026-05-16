<template>
  <div class="leaderboard-view">
    <h2 class="mb-4">Leaderboard</h2>

    <div v-if="loading" class="text-center">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else class="table-responsive">
      <table class="table table-striped table-hover">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Username</th>
            <th>Total Score</th>
            <th>Contributions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(user, index) in leaderboard" :key="user.id" :class="{ 'table-primary': user.is_current_user }">
            <td>
              <span v-if="index === 0" class="badge bg-warning">🥇</span>
              <span v-else-if="index === 1" class="badge bg-secondary">🥈</span>
              <span v-else-if="index === 2" class="badge bg-danger">🥉</span>
              <span v-else>{{ index + 1 }}</span>
            </td>
            <td>
              {{ user.username }}
              <span v-if="user.is_current_user" class="badge bg-info ms-2">You</span>
            </td>
            <td>{{ user.total_score }}</td>
            <td>{{ user.vote_count }} votes</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../lib/api'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const leaderboard = ref([])
const loading = ref(true)

async function loadLeaderboard() {
  try {
    const data = await api.getLeaderboard()
    leaderboard.value = data.map(user => ({
      ...user,
      is_current_user: user.username === authStore.user?.username
    }))
  } catch (error) {
    console.error('Error loading leaderboard:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadLeaderboard()
})
</script>

<style scoped>
.table-primary {
  font-weight: bold;
}
</style>

