<template>
  <!-- Dataset Modal -->
  <div v-if="showModal.dataset" class="modal show d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{{ datasetForm.id ? 'Edit Dataset' : 'Create Dataset' }}</h5>
          <button type="button" class="btn-close" @click="$emit('close-dataset-modal')"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Study *</label>
            <select v-model="datasetForm.study_id" class="form-select" required>
              <option value="">Select Study</option>
              <option v-for="study in studies" :key="study.id" :value="String(study.id)">
                {{ study.name }}
              </option>
            </select>
          </div>
          <div class="mb-3">
            <label class="form-label">Name *</label>
            <input v-model="datasetForm.name" type="text" class="form-control" required>
          </div>
          <div class="mb-3">
            <label class="form-label">Description</label>
            <textarea v-model="datasetForm.description" class="form-control" rows="3"></textarea>
          </div>
          <div class="mb-3">
            <label class="form-label">Image Path *</label>
            <input v-model="datasetForm.image_path" type="text" class="form-control" required>
            <small class="form-text text-muted">Folder name in data/images/</small>
          </div>
          <div class="mb-3 form-check">
            <input v-model="datasetForm.is_public" type="checkbox" class="form-check-input" id="isPublic">
            <label class="form-check-label" for="isPublic">Public Dataset</label>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="$emit('close-dataset-modal')">Cancel</button>
          <button type="button" class="btn btn-primary" @click="$emit('save-dataset')">
            {{ datasetForm.id ? 'Update' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Study Modal -->
  <div v-if="showModal.study" class="modal show d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">{{ studyForm.id ? 'Edit Study' : 'Create Study' }}</h5>
          <button type="button" class="btn-close" @click="$emit('close-study-modal')"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Name *</label>
            <input v-model="studyForm.name" type="text" class="form-control" required>
          </div>
          <div class="mb-3">
            <label class="form-label">Description</label>
            <textarea v-model="studyForm.description" class="form-control" rows="3"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="$emit('close-study-modal')">Cancel</button>
          <button type="button" class="btn btn-primary" @click="$emit('save-study')">
            {{ studyForm.id ? 'Update' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Bulk Import Modal -->
  <div v-if="showModal.bulkImport" class="modal show d-block" tabindex="-1" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Bulk Import Samples</h5>
          <button type="button" class="btn-close" @click="$emit('close-bulk-import-modal')"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Dataset *</label>
            <select v-model="bulkImportForm.datasetId" class="form-select" required>
              <option value="">Select Dataset</option>
              <option v-for="ds in datasets" :key="ds.id" :value="ds.id">
                {{ ds.name }} ({{ ds.image_path }})
              </option>
            </select>
            <small class="form-text text-muted">
              Images will be imported from data/images/[image_path]/
            </small>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="$emit('close-bulk-import-modal')">Cancel</button>
          <button 
            type="button" 
            class="btn btn-primary" 
            @click="$emit('bulk-import')"
            :disabled="!bulkImportForm.datasetId"
          >
            Import
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'

const props = defineProps({
  showModal: {
    type: Object,
    required: true
  },
  datasetForm: {
    type: Object,
    required: true
  },
  studyForm: {
    type: Object,
    required: true
  },
  bulkImportForm: {
    type: Object,
    required: true
  },
  studies: {
    type: Array,
    default: () => []
  },
  datasets: {
    type: Array,
    default: () => []
  }
})

defineEmits([
  'close-dataset-modal',
  'close-study-modal',
  'close-bulk-import-modal',
  'save-dataset',
  'save-study',
  'bulk-import'
])
</script>

