<template>
  <div id="app">
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
      <div class="container-fluid">
        <router-link class="navbar-brand" to="/">
          <img src="/cmi-logo.svg" alt="Child Mind Institute" height="30" class="d-inline-block align-text-top me-2">
          MegaSwipes
        </router-link>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
          <ul class="navbar-nav ms-auto">
            <li class="nav-item" v-if="!user">
              <router-link class="nav-link" to="/login">Login</router-link>
            </li>
            <li class="nav-item" v-if="!user">
              <router-link class="nav-link" to="/signup">Sign Up</router-link>
            </li>
            <li class="nav-item" v-if="user">
              <router-link class="nav-link" to="/datasets">Datasets</router-link>
            </li>
            <li class="nav-item" v-if="user">
              <router-link class="nav-link" to="/leaderboard">Leaderboard</router-link>
            </li>
            <li class="nav-item" v-if="user">
              <router-link class="nav-link" to="/profile">Profile</router-link>
            </li>
            <li class="nav-item" v-if="isAdmin">
              <router-link class="nav-link" to="/admin">Admin</router-link>
            </li>
            <li class="nav-item" v-if="user">
              <button class="btn btn-link nav-link" @click="handleLogout">Logout</button>
            </li>
          </ul>
        </div>
      </div>
    </nav>

    <main class="container mt-4">
      <router-view />
    </main>

    <footer class="footer mt-auto py-3 bg-light">
      <div class="container text-center">
        <span class="text-muted">MegaSwipes - Neuroimaging Quality Control</span>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const user = computed(() => authStore.user)
const isAdmin = computed(() => authStore.isAdmin)

const handleLogout = async () => {
  await authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

main {
  flex: 1;
}

.footer {
  margin-top: auto;
}
</style>

