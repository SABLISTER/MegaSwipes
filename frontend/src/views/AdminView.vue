<template>
  <div class="admin-dashboard">
    <h1 class="mb-4">Admin Dashboard</h1>

    <!-- Alert Messages -->
    <div v-if="alert.show" :class="`alert alert-${alert.type} alert-dismissible fade show`" role="alert">
      {{ alert.message }}
      <button type="button" class="btn-close" @click="alert.show = false"></button>
    </div>

    <!-- Navigation Tabs -->
    <ul class="nav nav-tabs mb-4" role="tablist">
      <li class="nav-item" role="presentation">
        <button 
          :class="['nav-link', { active: activeTab === 'dashboard' }]"
          @click="activeTab = 'dashboard'"
          type="button"
        >
          📊 Dashboard
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          :class="['nav-link', { active: activeTab === 'users' }]"
          @click="activeTab = 'users'"
          type="button"
        >
          👥 Users
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          :class="['nav-link', { active: activeTab === 'datasets' }]"
          @click="activeTab = 'datasets'"
          type="button"
        >
          📁 Datasets
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          :class="['nav-link', { active: activeTab === 'samples' }]"
          @click="activeTab = 'samples'"
          type="button"
        >
          🖼️ Samples
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          :class="['nav-link', { active: activeTab === 'upload' }]"
          @click="activeTab = 'upload'"
          type="button"
        >
          📤 Upload Images
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          :class="['nav-link', { active: activeTab === 'assignments' }]"
          @click="activeTab = 'assignments'"
          type="button"
        >
          👥 Assignments
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          :class="['nav-link', { active: activeTab === 'studies' }]"
          @click="activeTab = 'studies'"
          type="button"
        >
          📚 Studies
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          :class="['nav-link', { active: activeTab === 'access' }]"
          @click="activeTab = 'access'"
          type="button"
        >
          🔐 Access Control
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          :class="['nav-link', { active: activeTab === 'splits' }]"
          @click="activeTab = 'splits'"
          type="button"
        >
          📊 Dataset Splits
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          :class="['nav-link', { active: activeTab === 'swipe-stats' }]"
          @click="activeTab = 'swipe-stats'"
          type="button"
        >
          📈 Swipe Statistics
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          :class="['nav-link', { active: activeTab === 'visualization' }]"
          @click="activeTab = 'visualization'"
          type="button"
        >
          📊 Data Visualization
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button 
          :class="['nav-link', { active: activeTab === 'database' }]"
          @click="activeTab = 'database'"
          type="button"
        >
          🗄️ Database
        </button>
      </li>
    </ul>

    <!-- Tab Content -->
    <div class="tab-content">
      <!-- Dashboard Tab -->
      <AdminDashboardTab 
        v-if="activeTab === 'dashboard'"
        :stats="stats"
        :loading="loading"
      />

      <!-- Users Tab -->
      <AdminUsersTab
        v-if="activeTab === 'users'"
        :users="users"
        :loading="loading"
        @toggle-admin="toggleAdmin"
        @delete-user="confirmDeleteUser"
        @view-votes="showUserVotes"
      />

      <!-- Datasets Tab -->
      <AdminDatasetsTab
        v-if="activeTab === 'datasets'"
        :datasets="datasets"
        :loading="loading"
        @create-dataset="showDatasetModal"
        @edit-dataset="showDatasetModal"
        @delete-dataset="confirmDeleteDataset"
      />

      <!-- Samples Tab -->
      <AdminSamplesTab
        v-if="activeTab === 'samples'"
        :samples="samples"
        :datasets="datasets"
        :selected-dataset-id="selectedDatasetFilter"
        :loading="loading"
        @filter-change="selectedDatasetFilter = $event"
        @bulk-import="showBulkImportModal"
        @delete-sample="confirmDeleteSample"
      />

      <!-- Upload Tab -->
      <AdminUploadTab
        v-if="activeTab === 'upload'"
        :datasets="datasets"
        :loading="loading"
      />

      <!-- Assignments Tab -->
      <AdminAssignmentsTab
        v-if="activeTab === 'assignments'"
        :datasets="datasets"
        :users="users"
        :loading="loading"
      />

      <!-- Studies Tab -->
      <AdminStudiesTab
        v-if="activeTab === 'studies'"
        :studies="studies"
        :loading="loading"
        @create-study="showStudyModal"
        @edit-study="showStudyModal"
        @delete-study="confirmDeleteStudy"
      />

      <!-- Access Control Tab -->
      <AdminAccessTab
        v-if="activeTab === 'access'"
        :users="users"
        :datasets="datasets"
        :access-grants="accessGrants"
        :access-form="accessForm"
        :loading="loading"
        @update:userId="accessForm.userId = $event"
        @update:datasetId="accessForm.datasetId = $event"
        @grant-access="handleGrantAccess"
        @revoke-access="confirmRevokeAccess"
      />

      <!-- Dataset Splits Tab -->
      <div v-if="activeTab === 'splits'" class="tab-pane">
        <DatasetSplitManager />
      </div>

      <!-- Swipe Statistics Tab -->
      <AdminSwipeStatsTab
        v-if="activeTab === 'swipe-stats'"
        :loading="loading"
      />

      <!-- Data Visualization Tab -->
      <AdminDataVisualizationTab
        v-if="activeTab === 'visualization'"
        :loading="loading"
      />

      <!-- Database Tab -->
      <AdminDatabaseTab 
        v-if="activeTab === 'database'" 
      />
    </div>

    <!-- All Modals -->
    <AdminModals
      :show-modal="showModal"
      :dataset-form="datasetForm"
      :study-form="studyForm"
      :bulk-import-form="bulkImportForm"
      :studies="studies"
      :datasets="datasets"
      @close-dataset-modal="closeDatasetModal"
      @close-study-modal="closeStudyModal"
      @close-bulk-import-modal="closeBulkImportModal"
      @save-dataset="saveDataset"
      @save-study="saveStudy"
      @bulk-import="handleBulkImport"
    />

    <!-- User Votes Modal -->
    <UserVotesModal
      :show="showUserVotesModal"
      :user="selectedUser"
      @close="closeUserVotesModal"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import api from '../lib/api'
import DatasetSplitManager from '../views/DatasetSplitManager.vue'
import AdminDashboardTab from '../components/admin/AdminDashboardTab.vue'
import AdminUsersTab from '../components/admin/AdminUsersTab.vue'
import AdminDatasetsTab from '../components/admin/AdminDatasetsTab.vue'
import AdminSamplesTab from '../components/admin/AdminSamplesTab.vue'
import AdminStudiesTab from '../components/admin/AdminStudiesTab.vue'
import AdminAccessTab from '../components/admin/AdminAccessTab.vue'
import AdminSwipeStatsTab from '../components/admin/AdminSwipeStatsTab.vue'
import AdminDataVisualizationTab from '../components/admin/AdminDataVisualizationTab.vue'
import AdminDatabaseTab from '../components/admin/AdminDatabaseTab.vue'
import AdminUploadTab from '../components/admin/AdminUploadTab.vue'
import AdminAssignmentsTab from '../components/admin/AdminAssignmentsTab.vue'
import AdminModals from '../components/admin/AdminModals.vue'
import UserVotesModal from '../components/admin/UserVotesModal.vue'
import { useAdminAlert, useAdminData, formatDate } from '../composables/useAdmin.js'

// Use composables
const { alert, showAlert } = useAdminAlert()
const { loading, loadStats, loadUsers, loadDatasets, loadSamples, loadStudies, loadAccessGrants } = useAdminData()

// State
const activeTab = ref('dashboard')

// Data
const stats = ref({})
const users = ref([])
const datasets = ref([])
const samples = ref([])
const studies = ref([])
const accessGrants = ref([])

// Filters
const userSearch = ref('')
const selectedDatasetFilter = ref('')

// Forms
const datasetForm = ref({ id: null, study_id: '', name: '', description: '', image_path: '', is_public: true })
const studyForm = ref({ id: null, name: '', description: '' })
const bulkImportForm = ref({ datasetId: '' })
const accessForm = ref({ userId: '', datasetId: '' })

// Modals
const showModal = ref({ dataset: false, study: false, bulkImport: false })
const showUserVotesModal = ref(false)
const selectedUser = ref(null)

// Computed
const privateDatasets = computed(() => {
  return datasets.value.filter(d => !d.is_public)
})

// Watch for dataset filter changes
watch(selectedDatasetFilter, async (newVal) => {
  if (activeTab.value === 'samples') {
    loading.value = true
    try {
      await loadSamplesData(newVal || null)
    } catch (error) {
      showAlert('error', error.message || 'Failed to load samples')
    } finally {
      loading.value = false
    }
  }
})

// Watch for tab changes
watch(activeTab, async (newTab) => {
  loading.value = true
  try {
    switch (newTab) {
      case 'dashboard':
        await loadStatsData()
        break
      case 'users':
        await loadUsersData()
        break
      case 'datasets':
        await loadDatasetsData()
        break
      case 'samples':
        await loadDatasetsData() // Need datasets for filter
        await loadSamplesData()
        break
      case 'upload':
        await loadDatasetsData() // Need datasets for upload
        break
      case 'assignments':
        if (users.value.length === 0) await loadUsersData()
        if (datasets.value.length === 0) await loadDatasetsData()
        break
      case 'studies':
        await loadStudiesData()
        break
      case 'access':
        if (users.value.length === 0) await loadUsersData()
        if (datasets.value.length === 0) await loadDatasetsData()
        await loadAccessGrantsData()
        break
    }
  } catch (error) {
    showAlert('error', error.message || 'Failed to load data')
  } finally {
    loading.value = false
  }
})

// Load data functions (wrappers to update refs)
async function loadStatsData() {
  stats.value = await loadStats()
}

async function loadUsersData() {
  users.value = await loadUsers()
}

async function loadDatasetsData() {
  datasets.value = await loadDatasets()
}

async function loadSamplesData(datasetId = null) {
  samples.value = await loadSamples(datasetId)
}

async function loadStudiesData() {
  studies.value = await loadStudies()
}

async function loadAccessGrantsData() {
  accessGrants.value = await loadAccessGrants()
}

// User management
async function toggleAdmin(user) {
  if (!confirm(`${user.is_admin ? 'Revoke' : 'Grant'} admin privileges for ${user.username}?`)) return
  
  try {
    await api.updateUser(user.id, { is_admin: !user.is_admin })
    showAlert('success', `Admin privileges ${user.is_admin ? 'revoked from' : 'granted to'} ${user.username}`)
    await loadUsersData()
  } catch (error) {
    showAlert('error', error.message || 'Failed to update user')
  }
}

async function confirmDeleteUser(user) {
  if (!confirm(`Are you sure you want to delete user ${user.username}? This will also delete all their votes.`)) return
  
  try {
    await api.deleteUser(user.id)
    showAlert('success', `User ${user.username} deleted successfully`)
    await loadUsersData()
  } catch (error) {
    showAlert('error', error.message || 'Failed to delete user')
  }
}

// User votes viewing
function showUserVotes(user) {
  selectedUser.value = user
  showUserVotesModal.value = true
}

function closeUserVotesModal() {
  showUserVotesModal.value = false
  selectedUser.value = null
}

// Dataset management
function showDatasetModal(dataset = null) {
  if (dataset) {
    // Ensure study_id is properly set when editing (convert to string for select binding)
    datasetForm.value = { 
      ...dataset,
      study_id: dataset.study_id ? String(dataset.study_id) : ''
    }
  } else {
    datasetForm.value = { id: null, study_id: '', name: '', description: '', image_path: '', is_public: true }
  }
  showModal.value.dataset = true
}

function closeDatasetModal() {
  showModal.value.dataset = false
  datasetForm.value = { id: null, study_id: '', name: '', description: '', image_path: '', is_public: true }
}

async function saveDataset() {
  try {
    // Prepare form data, ensuring study_id is a number
    const formData = {
      ...datasetForm.value,
      study_id: datasetForm.value.study_id ? Number(datasetForm.value.study_id) : null
    }
    
    if (datasetForm.value.id) {
      await api.updateDataset(datasetForm.value.id, formData)
      showAlert('success', 'Dataset updated successfully')
    } else {
      await api.createDataset(formData)
      showAlert('success', 'Dataset created successfully')
    }
    closeDatasetModal()
    await loadDatasetsData()
  } catch (error) {
    showAlert('error', error.message || 'Failed to save dataset')
  }
}

async function confirmDeleteDataset(dataset) {
  if (!confirm(`Are you sure you want to delete dataset "${dataset.name}"? This will also delete all samples and votes.`)) return
  
  try {
    await api.deleteDataset(dataset.id)
    showAlert('success', `Dataset "${dataset.name}" deleted successfully`)
    await loadDatasetsData()
  } catch (error) {
    console.error('Delete dataset error:', error)
    showAlert('error', error.message || 'Failed to delete dataset')
  }
}

// Sample management
function showBulkImportModal() {
  bulkImportForm.value = { datasetId: '' }
  showModal.value.bulkImport = true
}

function closeBulkImportModal() {
  showModal.value.bulkImport = false
  bulkImportForm.value = { datasetId: '' }
}

async function handleBulkImport() {
  try {
    const result = await api.bulkImportSamples(bulkImportForm.value.datasetId)
    showAlert('success', result.message || `Imported ${result.imported} samples`)
    closeBulkImportModal()
    await loadSamplesData(selectedDatasetFilter.value || null)
  } catch (error) {
    showAlert('error', error.message || 'Failed to import samples')
  }
}

async function confirmDeleteSample(sample) {
  if (!confirm(`Are you sure you want to delete sample "${sample.filename}"? This will also delete all votes for this sample.`)) return
  
  try {
    await api.deleteSample(sample.id)
    showAlert('success', `Sample "${sample.filename}" deleted successfully`)
    await loadSamplesData(selectedDatasetFilter.value || null)
  } catch (error) {
    showAlert('error', error.message || 'Failed to delete sample')
  }
}

// Study management
function showStudyModal(study = null) {
  if (study) {
    studyForm.value = { ...study }
  } else {
    studyForm.value = { id: null, name: '', description: '' }
  }
  showModal.value.study = true
}

function closeStudyModal() {
  showModal.value.study = false
  studyForm.value = { id: null, name: '', description: '' }
}

async function saveStudy() {
  try {
    if (studyForm.value.id) {
      await api.updateStudy(studyForm.value.id, studyForm.value)
      showAlert('success', 'Study updated successfully')
    } else {
      await api.createStudy(studyForm.value)
      showAlert('success', 'Study created successfully')
    }
    closeStudyModal()
    await loadStudiesData()
  } catch (error) {
    showAlert('error', error.message || 'Failed to save study')
  }
}

async function confirmDeleteStudy(study) {
  if (!confirm(`Are you sure you want to delete study "${study.name}"? This will also delete all associated datasets, samples, and votes.`)) return
  
  try {
    await api.deleteStudy(study.id)
    showAlert('success', `Study "${study.name}" deleted successfully`)
    await loadStudiesData()
  } catch (error) {
    console.error('Delete study error:', error)
    showAlert('error', error.message || 'Failed to delete study')
  }
}

// Access control
async function handleGrantAccess() {
  try {
    await api.grantAccess(accessForm.value.userId, accessForm.value.datasetId)
    showAlert('success', 'Access granted successfully')
    accessForm.value = { userId: '', datasetId: '' }
    await loadAccessGrantsData()
  } catch (error) {
    showAlert('error', error.message || 'Failed to grant access')
  }
}

async function confirmRevokeAccess(grant) {
  if (!confirm(`Revoke access for ${grant.username} to ${grant.dataset_name}?`)) return
  
  try {
    await api.revokeAccess(grant.user_id, grant.dataset_id)
    showAlert('success', 'Access revoked successfully')
    await loadAccessGrantsData()
  } catch (error) {
    showAlert('error', error.message || 'Failed to revoke access')
  }
}

// Initialize
onMounted(async () => {
  loading.value = true
  try {
    await loadStatsData()
  } catch (error) {
    console.error('AdminView: Error loading dashboard:', error)
    showAlert('error', error.message || 'Failed to load dashboard')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.admin-dashboard {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.nav-tabs .nav-link {
  cursor: pointer;
}

.tab-pane {
  display: block !important;
  min-height: 400px;
}

.card {
  margin-bottom: 1rem;
  background-color: white;
  border: 1px solid #dee2e6;
}

.table {
  margin-bottom: 0;
}

.modal.show {
  display: block;
}

.progress {
  background-color: #e9ecef;
}

.badge {
  font-size: 0.875rem;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}

.list-group-item {
  border: none;
  border-bottom: 1px solid #dee2e6;
}

.list-group-item:last-child {
  border-bottom: none;
}

/* Debug styles */
.row {
  margin-bottom: 1rem;
}

.col-md-2, .col-md-3, .col-md-5, .col-md-6, .col-md-12 {
  padding: 0.5rem;
}
</style>
