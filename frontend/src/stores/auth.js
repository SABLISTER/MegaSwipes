import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../lib/api';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const loading = ref(true);

  const isAuthenticated = computed(() => !!user.value);
  const isAdmin = computed(() => user.value?.is_admin === 1);

  async function initialize() {
    try {
      // Check if we have a token
      const token = localStorage.getItem('token');
      if (token) {
        api.setToken(token);
        // Retry logic: wait for backend to be ready
        let retries = 5;
        let delay = 500; // Start with 500ms delay
        
        while (retries > 0) {
          try {
            const data = await api.getUser();
            user.value = data.user;
            break; // Success, exit retry loop
          } catch (error) {
            retries--;
            if (retries === 0) {
              throw error; // Re-throw on final failure
            }
            // Wait before retrying, with exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay));
            delay = Math.min(delay * 1.5, 2000); // Max 2 seconds
          }
        }
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      // Clear invalid token only if it's an auth error (401/403), not connection errors
      if (error.message && 
          !error.message.includes('Failed to fetch') && 
          !error.message.includes('ECONNREFUSED') &&
          !error.message.includes('Backend server is not available')) {
        localStorage.removeItem('token');
        api.setToken(null);
      }
    } finally {
      loading.value = false;
    }
  }

  async function signUp(username, email, password, consent) {
    const data = await api.signUp(username, email, password, consent);
    user.value = data.user;
    return data;
  }

  async function signIn(email, password) {
    const data = await api.signIn(email, password);
    user.value = data.user;
    return data;
  }

  async function logout() {
    await api.signOut();
    user.value = null;
  }

  return {
    user,
    loading,
    isAuthenticated,
    isAdmin,
    initialize,
    signUp,
    signIn,
    logout
  };
});

