<template>
  <div class="signup-view">
    <div class="row justify-content-center">
      <div class="col-md-6 col-lg-4">
        <div class="card">
          <div class="card-body">
            <h2 class="card-title text-center mb-4">Sign Up</h2>
            
            <div v-if="error" class="alert alert-danger" role="alert">
              {{ error }}
            </div>

            <div v-if="success" class="alert alert-success" role="alert">
              Account created! Please check your email to verify your account.
            </div>

            <form @submit.prevent="handleSignUp" v-if="!success">
              <div class="mb-3">
                <label for="username" class="form-label">Username</label>
                <input
                  type="text"
                  class="form-control"
                  id="username"
                  v-model="username"
                  required
                  autocomplete="username"
                >
              </div>

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
                  autocomplete="new-password"
                  minlength="6"
                >
                <div class="form-text">Password must be at least 6 characters</div>
              </div>

              <div class="mb-3 form-check">
                <input
                  type="checkbox"
                  class="form-check-input"
                  id="consent"
                  v-model="consent"
                  required
                >
                <label class="form-check-label" for="consent">
                  I agree to participate and consent to data collection
                </label>
              </div>

              <button
                type="submit"
                class="btn btn-primary w-100"
                :disabled="loading"
              >
                <span v-if="loading" class="spinner-border spinner-border-sm me-2"></span>
                {{ loading ? 'Creating account...' : 'Sign Up' }}
              </button>
            </form>

            <div class="text-center mt-3">
              <p class="mb-0">
                Already have an account?
                <router-link to="/login">Login</router-link>
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
import { useAuthStore } from '../stores/auth'

const authStore = useAuthStore()

const username = ref('')
const email = ref('')
const password = ref('')
const consent = ref(false)
const loading = ref(false)
const error = ref(null)
const success = ref(false)

const handleSignUp = async () => {
  loading.value = true
  error.value = null

  try {
    await authStore.signUp(username.value, email.value, password.value, consent.value)
    success.value = true
  } catch (err) {
    error.value = err.message || 'Failed to create account. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.signup-view {
  padding-top: 50px;
}
</style>

