<template>
  <div class="login-view">
    <div class="row justify-content-center">
      <div class="col-md-6 col-lg-4">
        <div class="card">
          <div class="card-body">
            <h2 class="card-title text-center mb-4">Login</h2>
            
            <div v-if="error" class="alert alert-danger" role="alert">
              {{ error }}
            </div>

            <form @submit.prevent="handleLogin">
              <div class="mb-3">
                <label for="email" class="form-label">Email</label>
                <input
                  type="email"
                  class="form-control"
                  id="email"
                  v-model="email"
                  required
                  autocomplete="email"
                >
              </div>

              <div class="mb-3">
                <label for="password" class="form-label">Password</label>
                <input
                  type="password"
                  class="form-control"
                  id="password"
                  v-model="password"
                  required
                  autocomplete="current-password"
                >
              </div>

              <button
                type="submit"
                class="btn btn-primary w-100"
                :disabled="loading"
              >
                <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
                {{ loading ? 'Logging in...' : 'Login' }}
              </button>
            </form>

            <div class="text-center mt-3">
              <p class="mb-0">
                Don't have an account?
                <router-link to="/signup">Sign up</router-link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref(null)

const handleLogin = async () => {
  loading.value = true
  error.value = null

  try {
    await authStore.signIn(email.value, password.value)
    router.push('/datasets')
  } catch (err) {
    error.value = err.message || 'Failed to login. Please check your credentials.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-view {
  padding-top: 50px;
}
</style>

