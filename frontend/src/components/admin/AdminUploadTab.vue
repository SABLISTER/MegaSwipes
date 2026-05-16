<template>
  <div class="tab-pane">
    <div v-if="loading" class="text-center py-5">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>
    <div v-else>
      <div class="card">
        <div class="card-header">
          <h5 class="mb-0">Upload Images</h5>
        </div>
        <div class="card-body">
          <!-- Alert Messages -->
          <div v-if="alert.show" :class="`alert alert-${alert.type} alert-dismissible fade show`" role="alert">
            {{ alert.message }}
            <button type="button" class="btn-close" @click="alert.show = false"></button>
          </div>

          <!-- Upload Form -->
          <div class="mb-4">
            <div class="mb-3">
              <label class="form-label">Dataset *</label>
              <select v-model="selectedDatasetId" class="form-select" required>
                <option value="">Select Dataset</option>
                <option v-for="ds in datasets" :key="ds.id" :value="ds.id">
                  {{ ds.name }}
                </option>
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label">Select Images</label>
              <input
                type="file"
                ref="fileInput"
                @change="handleFileSelect"
                multiple
                accept="image/png,image/jpeg,image/jpg,image/gif"
                class="form-control"
              />
              <small class="form-text text-muted">
                You can select multiple images at once. Supported formats: PNG, JPG, JPEG, GIF (max 10MB per file)
              </small>
            </div>

            <!-- Selected Files Preview -->
            <div v-if="selectedFiles.length > 0" class="mb-3">
              <h6>Selected Files ({{ selectedFiles.length }})</h6>
              <div class="list-group" style="max-height: 300px; overflow-y: auto;">
                <div
                  v-for="(file, index) in selectedFiles"
                  :key="index"
                  class="list-group-item d-flex justify-content-between align-items-center"
                >
                  <div>
                    <strong>{{ file.name }}</strong>
                    <small class="text-muted d-block">{{ formatFileSize(file.size) }}</small>
                  </div>
                  <button
                    @click="removeFile(index)"
                    class="btn btn-sm btn-outline-danger"
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>

            <!-- Upload Button -->
            <button
              @click="uploadFiles"
              :disabled="!selectedDatasetId || selectedFiles.length === 0 || uploading"
              class="btn btn-primary"
            >
              <span v-if="uploading" class="spinner-border spinner-border-sm me-2" role="status"></span>
              {{ uploading ? 'Uploading...' : `Upload ${selectedFiles.length} Image${selectedFiles.length !== 1 ? 's' : ''}` }}
            </button>
          </div>

          <!-- Upload Results -->
          <div v-if="uploadResults" class="mt-4">
            <h6>Upload Results</h6>
            <div class="alert alert-success" v-if="uploadResults.success">
              <strong>Success:</strong> {{ uploadResults.message }}
            </div>
            <div v-if="uploadResults.results">
              <p>
                <strong>Uploaded:</strong> {{ uploadResults.results.success?.length || 0 }} files
              </p>
              <div v-if="uploadResults.results.failed?.length > 0" class="alert alert-warning">
                <strong>Failed:</strong> {{ uploadResults.results.failed.length }} files
                <ul class="mb-0 mt-2">
                  <li v-for="(fail, idx) in uploadResults.results.failed" :key="idx">
                    {{ fail.filename }}: {{ fail.error }}
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Recently Uploaded Images -->
          <div v-if="recentUploads.length > 0" class="mt-4">
            <h6>Recently Uploaded</h6>
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Path</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="upload in recentUploads" :key="upload.id">
                  <td>{{ upload.filename }}</td>
                  <td><small class="text-muted">{{ upload.file_path }}</small></td>
                  <td><small>{{ formatDate(upload.created_at) }}</small></td>
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
import { ref, onMounted } from 'vue'
import api from '../../lib/api'
import { formatDate } from '../../composables/useAdmin.js'

const props = defineProps({
  datasets: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const selectedDatasetId = ref('')
const selectedFiles = ref([])
const uploading = ref(false)
const uploadResults = ref(null)
const recentUploads = ref([])
const fileInput = ref(null)
const alert = ref({ show: false, type: 'success', message: '' })

function showAlert(type, message) {
  alert.value = { show: true, type, message }
  setTimeout(() => {
    alert.value.show = false
  }, 5000)
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files)
  selectedFiles.value = [...selectedFiles.value, ...files]
}

function removeFile(index) {
  selectedFiles.value.splice(index, 1)
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
}

async function uploadFiles() {
  if (!selectedDatasetId.value || selectedFiles.value.length === 0) {
    showAlert('danger', 'Please select a dataset and at least one file')
    return
  }

  uploading.value = true
  uploadResults.value = null

  try {
    if (selectedFiles.value.length === 1) {
      // Single file upload
      const formData = new FormData()
      formData.append('image', selectedFiles.value[0])
      formData.append('dataset_id', selectedDatasetId.value)

      const result = await api.uploadSingleImage(formData)
      uploadResults.value = {
        success: true,
        message: result.message,
        results: {
          success: [result.sample],
          failed: []
        }
      }
      recentUploads.value.unshift(result.sample)
    } else {
      // Batch upload
      const formData = new FormData()
      selectedFiles.value.forEach(file => {
        formData.append('images', file)
      })
      formData.append('dataset_id', selectedDatasetId.value)

      const result = await api.uploadBatchImages(formData)
      uploadResults.value = result
      
      if (result.results?.success) {
        recentUploads.value = [...result.results.success, ...recentUploads.value].slice(0, 20)
      }
    }

    showAlert('success', uploadResults.value.message)
    
    // Clear selected files
    selectedFiles.value = []
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  } catch (error) {
    console.error('Upload error:', error)
    showAlert('danger', error.message || 'Failed to upload images')
    uploadResults.value = {
      success: false,
      message: error.message || 'Upload failed',
      results: {
        success: [],
        failed: selectedFiles.value.map(f => ({ filename: f.name, error: error.message }))
      }
    }
  } finally {
    uploading.value = false
  }
}

onMounted(() => {
  // Component mounted
})
</script>

