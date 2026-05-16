<template>
  <div class="tab-pane">
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>
    <div v-else>
      <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h5 class="mb-0">User Management</h5>
          <input 
            v-model="userSearch" 
            type="text" 
            class="form-control w-25" 
            placeholder="Search users..."
            @input="$emit('search', $event.target.value)"
          >
        </div>
        <div class="card-body">
          <table class="table table-hover">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Score</th>
                <th>Votes</th>
                <th>Admin</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in filteredUsers" :key="user.id">
                <td>{{ user.username }}</td>
                <td>{{ user.email }}</td>
                <td>{{ user.total_score }}</td>
                <td>{{ user.vote_count }}</td>
                <td>
                  <span :class="user.is_admin ? 'badge bg-success' : 'badge bg-secondary'">
                    {{ user.is_admin ? 'Yes' : 'No' }}
                  </span>
                </td>
                <td>{{ formatDate(user.created_at) }}</td>
                <td>
                  <button 
                    @click="$emit('view-votes', user)" 
                    class="btn btn-sm btn-outline-info me-1"
                    title="View User Votes"
                  >
                    🖼️
                  </button>
                  <button 
                    @click="$emit('toggle-admin', user)" 
                    class="btn btn-sm btn-outline-primary me-1"
                    :title="user.is_admin ? 'Revoke Admin' : 'Grant Admin'"
                  >
                    {{ user.is_admin ? '👤' : '👑' }}
                  </button>
                  <button 
                    @click="$emit('delete-user', user)" 
                    class="btn btn-sm btn-outline-danger"
                    title="Delete User"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatDate } from '../../composables/useAdmin.js'

const props = defineProps({
  users: {
    type: Array,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['toggle-admin', 'delete-user', 'search', 'view-votes'])

const userSearch = ref('')

const filteredUsers = computed(() => {
  if (!userSearch.value) return props.users
  const search = userSearch.value.toLowerCase()
  return props.users.filter(u => 
    u.username.toLowerCase().includes(search) || 
    u.email.toLowerCase().includes(search)
  )
})
</script>

