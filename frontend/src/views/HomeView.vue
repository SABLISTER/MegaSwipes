<template>
  <div class="home">
    <div class="jumbotron bg-light p-5 rounded-3">
      <div class="text-center mb-4">
        <img src="/megaswipes.png" alt="MegaSwipes Logo" class="logo-img">
      </div>
      <h1 class="display-4">Welcome to MegaSwipes</h1>
      <p class="lead">
        A platform for collaborative quality assurance of neuroimaging datasets.
      </p>
      <hr class="my-4">
      <p>
        MegaSwipes brings an intuitive swipe interface to neuroimaging quality control. 
        Join the community in ensuring the highest quality brain imaging data for research.
      </p>
      <div class="mt-4">
        <router-link v-if="!isAuthenticated" to="/signup" class="btn btn-primary btn-lg me-2">
          Get Started
        </router-link>
        <router-link v-if="!isAuthenticated" to="/login" class="btn btn-outline-primary btn-lg">
          Login
        </router-link>
        <router-link v-if="isAuthenticated" to="/datasets" class="btn btn-primary btn-lg">
          View Datasets
        </router-link>
      </div>
    </div>

    <div class="row mt-5">
      <div class="col-md-4">
        <div class="card">
          <div class="card-body">
            <h5 class="card-title">🧠 Quality Control</h5>
            <p class="card-text">
              Review neuroimaging data with an intuitive swipe interface. 
              Help identify quality issues in brain scans.
            </p>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card">
          <div class="card-body">
            <h5 class="card-title">👥 Collaborative</h5>
            <p class="card-text">
              Join a community of researchers and contributors working together 
              to improve neuroimaging data quality.
            </p>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card">
          <div class="card-body">
            <h5 class="card-title">🏆 Gamified</h5>
            <p class="card-text">
              Track your progress on the leaderboard and earn points 
              for your contributions to the community.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()
const isAuthenticated = computed(() => authStore.isAuthenticated)
</script>

<style scoped>
.home {
  max-width: 1200px;
  margin: 0 auto;
}

.logo-img {
  max-width: 500px;
  width: 100%;
  height: auto;
  margin-bottom: 1rem;
}

.card {
  height: 100%;
  transition: transform 0.2s;
}

.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}
</style>

