<template>
  <div class="card mb-4">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h6 class="mb-0">Upload QC Data</h6>
      <button @click="showQcUpload = !showQcUpload" class="btn btn-sm btn-outline-primary">
        {{ showQcUpload ? 'Hide' : 'Show' }} Upload
      </button>
    </div>
    <div class="card-body" v-if="showQcUpload">
      <p class="text-muted small mb-3">
        Upload a CSV or TSV file containing Euler numbers or other QC metrics. 
        The file must have a column for ID (Filename, Subject ID, etc.) and a column for the metric (e.g., "Euler", "QC").
      </p>
      <div class="mb-3">
        <input class="form-control" type="file" id="qcDataFile" accept=".csv,.tsv,.txt" @change="handleQcFileUpload">
        <div class="form-text">Supported formats: CSV, TSV</div>
      </div>
      <div v-if="uploadStatus" :class="{'text-success': uploadStatus.success, 'text-danger': !uploadStatus.success}" class="mb-2">
        {{ uploadStatus.message }}
      </div>
      <button @click="uploadQcData" class="btn btn-primary" :disabled="!qcFile || uploadingQc">
        <span v-if="uploadingQc" class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
        {{ uploadingQc ? 'Uploading...' : 'Upload QC Data' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import api from '../../../lib/api.js'

const emit = defineEmits(['upload-success'])

const showQcUpload = ref(false)
const qcFile = ref(null)
const uploadingQc = ref(false)
const uploadStatus = ref(null)

function handleQcFileUpload(event) {
  const file = event.target.files[0]
  if (file) {
    qcFile.value = file
    uploadStatus.value = null
  }
}

async function uploadQcData() {
  if (!qcFile.value) return
  
  uploadingQc.value = true
  uploadStatus.value = null
  
  try {
    const formData = new FormData()
    formData.append('file', qcFile.value)
    
    // Use raw fetch or axios if available - assuming api.js has a method or we use fetch with token
    const token = localStorage.getItem('token')
    const response = await fetch(`${api.getApiBaseUrl()}/admin/upload/euler`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    })
    
    const result = await response.json()
    
    if (response.ok) {
      uploadStatus.value = { success: true, message: result.message }
      emit('upload-success')
    } else {
      uploadStatus.value = { success: false, message: result.error || 'Upload failed' }
    }
  } catch (error) {
    console.error('Upload error:', error)
    uploadStatus.value = { success: false, message: 'Network error: ' + error.message }
  } finally {
    uploadingQc.value = false
  }
}
</script>
