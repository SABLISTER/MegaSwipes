<template>
  <div 
    v-if="show" 
    class="modal fade show d-block" 
    tabindex="-1" 
    role="dialog"
    style="background-color: rgba(0,0,0,0.5);"
    @click.self="close"
  >
    <div class="modal-dialog modal-xl modal-dialog-scrollable" role="document" @click.stop>
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            Votes for {{ user?.username || 'User' }}
            <span v-if="votes.length > 0" class="badge bg-primary ms-2">{{ votes.length }}</span>
          </h5>
          <button type="button" class="btn-close" @click="close" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div v-if="loading" class="text-center py-5">
            <div class="spinner-border" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          </div>
          <div v-else-if="votes.length === 0" class="text-center py-5">
            <p class="text-muted">No votes found for this user.</p>
          </div>
          <div v-else class="votes-grid">
            <div 
              v-for="vote in votes" 
              :key="vote.id" 
              class="vote-card card mb-3"
            >
              <div class="card-body">
                <div class="row">
                  <div class="col-md-4">
                    <div class="image-container">
                      <img 
                        :src="getImageUrl(vote)" 
                        :alt="vote.filename"
                        class="img-fluid rounded"
                        @error="handleImageError"
                        style="max-height: 300px; width: 100%; object-fit: contain; background-color: #f8f9fa;"
                      />
                    </div>
                  </div>
                  <div class="col-md-8">
                    <div class="vote-info">
                      <h6 class="card-title">
                        {{ vote.filename }}
                        <span 
                          :class="vote.rating === 1 ? 'badge bg-success ms-2' : 'badge bg-danger ms-2'"
                        >
                          {{ vote.rating === 1 ? '👍 Pass' : '👎 Fail' }}
                        </span>
                      </h6>
                      <p class="text-muted mb-2">
                        <strong>Dataset:</strong> {{ vote.dataset_name }}
                      </p>
                      <p class="text-muted mb-2">
                        <strong>Date:</strong> {{ formatDate(vote.created_at) }}
                      </p>
                      <div v-if="vote.comment" class="mt-2">
                        <strong>Comment:</strong>
                        <p class="mb-0">{{ vote.comment }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="close">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import api from '../../lib/api'
import { formatDate } from '../../composables/useAdmin.js'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  user: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close'])

const votes = ref([])
const loading = ref(false)

// Watch for user changes and load votes
watch(() => props.user, async (newUser) => {
  if (newUser && props.show) {
    await loadVotes()
  }
}, { immediate: true })

// Watch for show changes
watch(() => props.show, async (isShowing) => {
  if (isShowing && props.user) {
    await loadVotes()
  } else {
    votes.value = []
  }
})

async function loadVotes() {
  if (!props.user) return
  
  loading.value = true
  try {
    const userData = await api.getAdminUser(props.user.id)
    votes.value = userData.votes || []
  } catch (error) {
    console.error('Error loading votes:', error)
    votes.value = []
  } finally {
    loading.value = false
  }
}

function getImageUrl(vote) {
  // Construct base URL
  let baseUrl
  if (import.meta.env.VITE_API_URL) {
    baseUrl = import.meta.env.VITE_API_URL.replace('/api', '')
  } else {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
    const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
    baseUrl = `${protocol}//${hostname}:3000`
  }
  
  // Try secure_token first, fallback to sample_id
  if (vote.secure_token) {
    return `${baseUrl}/api/images/${vote.secure_token}`
  } else if (vote.sample_id) {
    return `${baseUrl}/api/samples/${vote.sample_id}/image`
  }
  return ''
}

function handleImageError(event) {
  // Replace with placeholder or hide
  event.target.style.display = 'none'
  const container = event.target.closest('.image-container')
  if (container) {
    container.innerHTML = '<div class="text-muted p-3 text-center">Image not available</div>'
  }
}

function close() {
  emit('close')
}
</script>

<style scoped>
.votes-grid {
  max-height: 70vh;
  overflow-y: auto;
}

.vote-card {
  border: 1px solid #dee2e6;
}

.vote-card:hover {
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.image-container {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f8f9fa;
  border-radius: 0.25rem;
}

.modal-xl {
  max-width: 1200px;
}

.modal.show {
  display: block !important;
}
</style>

