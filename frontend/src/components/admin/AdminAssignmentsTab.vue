<template>
  <div class="tab-pane">
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>
    <div v-else>
      <!-- Statistics Cards -->
      <div class="row mb-4">
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <h6 class="card-subtitle mb-2 text-muted">Total Assignments</h6>
              <h3 class="mb-0">{{ stats.overall?.total_assignments || 0 }}</h3>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <h6 class="card-subtitle mb-2 text-muted">Assigned Samples</h6>
              <h3 class="mb-0">{{ stats.overall?.unique_samples || 0 }}</h3>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <h6 class="card-subtitle mb-2 text-muted">Assigned Users</h6>
              <h3 class="mb-0">{{ stats.overall?.unique_users || 0 }}</h3>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card">
            <div class="card-body">
              <h6 class="card-subtitle mb-2 text-muted">Unassigned Samples</h6>
              <h3 class="mb-0">{{ stats.unassigned || 0 }}</h3>
            </div>
          </div>
        </div>
      </div>

      <!-- Alert Messages -->
      <div v-if="alert.show" :class="`alert alert-${alert.type} alert-dismissible fade show`" role="alert">
        {{ alert.message }}
        <button type="button" class="btn-close" @click="alert.show = false"></button>
      </div>

      <!-- Assignment Management -->
      <div class="card mb-4">
        <div class="card-header">
          <h5 class="mb-0">Create Assignments</h5>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-4">
              <label class="form-label">Dataset</label>
              <select v-model="assignmentForm.datasetId" class="form-select" @change="loadSamples">
                <option value="">All Datasets</option>
                <option v-for="ds in datasets" :key="ds.id" :value="ds.id">
                  {{ ds.name }}
                </option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label">Users</label>
              <select v-model="assignmentForm.userIds" class="form-select" multiple size="5">
                <option v-for="user in users" :key="user.id" :value="user.id">
                  {{ user.username }} ({{ user.email }})
                </option>
              </select>
              <small class="form-text text-muted">Hold Ctrl/Cmd to select multiple users</small>
            </div>
            <div class="col-md-4">
              <label class="form-label">Assignment Type</label>
              <select v-model="assignmentForm.assignmentType" class="form-select">
                <option value="individual">Individual</option>
                <option value="overlap">Overlap</option>
                <option value="excluded">Excluded</option>
              </select>
            </div>
          </div>

          <div class="row mt-3">
            <div class="col-12">
              <label class="form-label">Samples</label>
              <div style="max-height: 250px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 0.25rem; padding: 0.5rem;">
                <div v-if="availableSamples.length === 0" class="text-muted">
                  Select a dataset to load samples
                </div>
                <div v-else>
                  <!-- Select All button - always visible -->
                  <div class="d-flex align-items-center gap-3 mb-2 p-2 bg-light rounded">
                    <button
                      type="button"
                      class="btn btn-sm"
                      :class="allSamplesSelected ? 'btn-success' : 'btn-outline-primary'"
                      @click="toggleAllSamplesButton"
                    >
                      {{ allSamplesSelected ? '✓ All Selected' : 'Select All' }}
                    </button>
                    <span class="text-muted">{{ availableSamples.length }} samples available</span>
                    <span v-if="assignmentForm.selectAllMode" class="badge bg-success">All selected</span>
                    <span v-else-if="assignmentForm.sampleIds.length > 0" class="badge bg-primary">
                      {{ assignmentForm.sampleIds.length }} selected
                    </span>
                  </div>
                  <!-- Show message when Select All is active -->
                  <div v-if="assignmentForm.selectAllMode" class="alert alert-success py-2 mb-2">
                    ✓ All {{ availableSamples.length }} samples will be assigned
                  </div>
                  <!-- Only show individual checkboxes when NOT in selectAllMode and count is reasonable -->
                  <div v-else-if="availableSamples.length <= 500">
                    <div v-for="sample in availableSamples" :key="sample.id" class="form-check">
                      <input
                        class="form-check-input"
                        type="checkbox"
                        :value="sample.id"
                        v-model="assignmentForm.sampleIds"
                        :id="`sample-${sample.id}`"
                      />
                      <label class="form-check-label" :for="`sample-${sample.id}`">
                        {{ sample.filename }}
                      </label>
                    </div>
                  </div>
                  <!-- For large datasets, just show the select all info -->
                  <div v-else-if="!assignmentForm.selectAllMode" class="alert alert-warning py-2">
                    Large dataset ({{ availableSamples.length }} samples). Click "Select All" above to select all samples for assignment.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-3">
            <button
              @click="createAssignments"
              :disabled="!canCreateAssignment || creating"
              class="btn btn-primary"
            >
              <span v-if="creating" class="spinner-border spinner-border-sm me-2" role="status"></span>
              {{ creating ? 'Creating...' : 'Create Assignments' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="card mb-4">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h5 class="mb-0">Current Assignments</h5>
          <button @click="loadAssignments" class="btn btn-sm btn-outline-primary">
            Refresh
          </button>
        </div>
        <div class="card-body">
          <div class="row mb-3">
            <div class="col-md-3">
              <label class="form-label">Filter by Dataset</label>
              <select v-model="filters.datasetId" class="form-select" @change="loadAssignments">
                <option value="">All Datasets</option>
                <option v-for="ds in datasets" :key="ds.id" :value="ds.id">
                  {{ ds.name }}
                </option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Filter by User</label>
              <select v-model="filters.userId" class="form-select" @change="loadAssignments">
                <option value="">All Users</option>
                <option v-for="user in users" :key="user.id" :value="user.id">
                  {{ user.username }}
                </option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Filter by Type</label>
              <select v-model="filters.assignmentType" class="form-select" @change="loadAssignments">
                <option value="">All Types</option>
                <option value="individual">Individual</option>
                <option value="overlap">Overlap</option>
                <option value="excluded">Excluded</option>
              </select>
            </div>
            <div class="col-md-3">
              <label class="form-label">Search</label>
              <input
                v-model="filters.search"
                type="text"
                class="form-control"
                placeholder="Search filename..."
                @input="loadAssignments"
              />
            </div>
          </div>

          <!-- Assignments Table -->
          <div class="table-responsive">
            <table class="table table-hover">
              <thead>
                <tr>
                  <th>Sample</th>
                  <th>Dataset</th>
                  <th>User</th>
                  <th>Type</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="assignment in filteredAssignments" :key="assignment.id">
                  <td>{{ assignment.filename }}</td>
                  <td>{{ assignment.dataset_name }}</td>
                  <td>{{ assignment.username }}</td>
                  <td>
                    <span :class="getAssignmentTypeBadgeClass(assignment.assignment_type)">
                      {{ assignment.assignment_type }}
                    </span>
                  </td>
                  <td>{{ formatDate(assignment.created_at) }}</td>
                  <td>
                    <button
                      @click="deleteAssignment(assignment)"
                      class="btn btn-sm btn-outline-danger"
                      title="Delete Assignment"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
                <tr v-if="filteredAssignments.length === 0">
                  <td colspan="6" class="text-center text-muted">No assignments found</td>
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
import { ref, computed, onMounted, watch } from 'vue'
import api from '../../lib/api'
import { formatDate } from '../../composables/useAdmin.js'

const props = defineProps({
  datasets: {
    type: Array,
    default: () => []
  },
  users: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const assignments = ref([])
const availableSamples = ref([])
const stats = ref({})
const loadingAssignments = ref(false)
const creating = ref(false)
const alert = ref({ show: false, type: 'success', message: '' })

const assignmentForm = ref({
  datasetId: '',
  userIds: [],
  sampleIds: [],
  assignmentType: 'individual',
  selectAllMode: false  // When true, all samples are selected without tracking individual IDs
})

const filters = ref({
  datasetId: '',
  userId: '',
  assignmentType: '',
  search: ''
})

const filteredAssignments = computed(() => {
  let result = assignments.value

  if (filters.value.search) {
    const search = filters.value.search.toLowerCase()
    result = result.filter(a => a.filename.toLowerCase().includes(search))
  }

  return result
})

const allSamplesSelected = computed(() => {
  return assignmentForm.value.selectAllMode ||
    (availableSamples.value.length > 0 &&
    assignmentForm.value.sampleIds.length === availableSamples.value.length)
})

const canCreateAssignment = computed(() => {
  return assignmentForm.value.datasetId &&
    assignmentForm.value.userIds.length > 0 &&
    (assignmentForm.value.selectAllMode || assignmentForm.value.sampleIds.length > 0)
})

function showAlert(type, message) {
  alert.value = { show: true, type, message }
  setTimeout(() => {
    alert.value.show = false
  }, 5000)
}

function getAssignmentTypeBadgeClass(type) {
  const classes = {
    individual: 'badge bg-primary',
    overlap: 'badge bg-warning',
    excluded: 'badge bg-danger'
  }
  return classes[type] || 'badge bg-secondary'
}

async function loadAssignments() {
  loadingAssignments.value = true
  try {
    const params = new URLSearchParams()
    if (filters.value.datasetId) params.append('dataset_id', filters.value.datasetId)
    if (filters.value.userId) params.append('user_id', filters.value.userId)
    if (filters.value.assignmentType) params.append('assignment_type', filters.value.assignmentType)

    const query = params.toString()
    assignments.value = await api.getAssignments(query ? `?${query}` : '')
  } catch (error) {
    console.error('Load assignments error:', error)
    showAlert('danger', 'Failed to load assignments')
  } finally {
    loadingAssignments.value = false
  }
}

async function loadSamples() {
  if (!assignmentForm.value.datasetId) {
    availableSamples.value = []
    return
  }

  try {
    const samples = await api.getAdminSamples(assignmentForm.value.datasetId)
    availableSamples.value = samples
    assignmentForm.value.sampleIds = []
    assignmentForm.value.selectAllMode = false
  } catch (error) {
    console.error('Load samples error:', error)
    showAlert('danger', 'Failed to load samples')
  }
}

async function loadStats() {
  try {
    stats.value = await api.getAssignmentStats()
  } catch (error) {
    console.error('Load stats error:', error)
  }
}

function toggleAllSamples(event) {
  if (event.target.checked) {
    // Use selectAllMode flag instead of creating huge array (prevents browser freeze)
    assignmentForm.value.selectAllMode = true
    assignmentForm.value.sampleIds = []  // Clear individual selections
  } else {
    assignmentForm.value.selectAllMode = false
    assignmentForm.value.sampleIds = []
  }
}

function toggleAllSamplesButton() {
  // Toggle select all mode
  if (assignmentForm.value.selectAllMode) {
    assignmentForm.value.selectAllMode = false
    assignmentForm.value.sampleIds = []
  } else {
    assignmentForm.value.selectAllMode = true
    assignmentForm.value.sampleIds = []
  }
}

async function createAssignments() {
  if (!canCreateAssignment.value) {
    showAlert('danger', 'Please select dataset, users, and samples')
    return
  }

  creating.value = true
  try {
    // Get sample IDs - either from selectAllMode or individual selection
    const sampleIds = assignmentForm.value.selectAllMode
      ? availableSamples.value.map(s => s.id)
      : assignmentForm.value.sampleIds

    await api.bulkAssignSamples(
      sampleIds,
      assignmentForm.value.userIds,
      assignmentForm.value.assignmentType
    )

    showAlert('success', `Assignments created successfully (${sampleIds.length} samples)`)
    
    // Reset form
    assignmentForm.value.sampleIds = []
    assignmentForm.value.selectAllMode = false
    
    // Reload data
    await loadAssignments()
    await loadStats()
  } catch (error) {
    console.error('Create assignments error:', error)
    showAlert('danger', error.message || 'Failed to create assignments')
  } finally {
    creating.value = false
  }
}

async function deleteAssignment(assignment) {
  if (!confirm(`Are you sure you want to delete this assignment?`)) {
    return
  }

  try {
    await api.deleteAssignment(assignment.id)
    showAlert('success', 'Assignment deleted successfully')
    await loadAssignments()
    await loadStats()
  } catch (error) {
    console.error('Delete assignment error:', error)
    showAlert('danger', error.message || 'Failed to delete assignment')
  }
}

onMounted(async () => {
  await loadAssignments()
  await loadStats()
})
</script>

<style scoped>
.badge {
  padding: 0.25em 0.5em;
  font-size: 0.875em;
}
</style>

