<template>
  <div class="import-wizard">
    <!-- Step Indicator -->
    <div class="steps mb-4">
      <div 
        v-for="(step, index) in steps" 
        :key="index"
        :class="['step-item', { active: currentStep === index + 1, completed: currentStep > index + 1 }]"
      >
        <div class="step-circle">{{ index + 1 }}</div>
        <div class="step-label">{{ step }}</div>
      </div>
    </div>

    <!-- Step 1: Scan & Select Folders -->
    <div v-if="currentStep === 1" class="step-content">
      <h5 class="mb-3">1. Select Folders from <code>data/images</code></h5>
      
      <div v-if="loadingScan" class="text-center py-4">
        <div class="spinner-border text-primary" role="status"></div>
        <p>Scanning directory...</p>
      </div>

      <div v-else-if="folders.length === 0" class="alert alert-warning">
        No folders found in <code>data/images</code>.
      </div>

      <div v-else class="list-group mb-3">
        <label v-for="folder in folders" :key="folder.name" class="list-group-item d-flex justify-content-between align-items-center cursor-pointer">
          <div>
            <input 
              class="form-check-input me-2" 
              type="checkbox" 
              :value="folder.name" 
              v-model="selectedFolders"
            >
            {{ folder.name }}
          </div>
          <span v-if="folder.existsInDb" class="badge bg-secondary">Already in DB</span>
          <span v-else class="badge bg-success">New</span>
        </label>
      </div>
    </div>

    <!-- Step 2: Select Subfolders (Sites) -->
    <div v-if="currentStep === 2" class="step-content">
      <h5 class="mb-3">2. Configure Sites (Subfolders)</h5>
      
      <p class="text-muted small">Select which subfolders (sites) to import for each dataset. If no sites are selected, the root folder will be scanned.</p>

      <div v-for="folderName in selectedFolders" :key="folderName" class="card mb-3">
        <div class="card-header">{{ folderName }}</div>
        <div class="card-body">
          <div v-if="sitesMap[folderName] && sitesMap[folderName].sites.length > 0">
             <div class="mb-2">
                <div class="form-check form-check-inline">
                  <input class="form-check-input" type="radio" :name="'site-mode-'+folderName" value="all" v-model="siteSelections[folderName].mode">
                  <label class="form-check-label">All Sites</label>
                </div>
                <div class="form-check form-check-inline">
                  <input class="form-check-input" type="radio" :name="'site-mode-'+folderName" value="manual" v-model="siteSelections[folderName].mode">
                  <label class="form-check-label">Select Specific</label>
                </div>
             </div>

             <div v-if="siteSelections[folderName].mode === 'manual'" class="ms-3 border-start ps-3">
                <div v-for="site in sitesMap[folderName].sites" :key="site" class="form-check">
                  <input 
                    class="form-check-input" 
                    type="checkbox" 
                    :value="site" 
                    v-model="siteSelections[folderName].selected"
                  >
                  <label class="form-check-label">{{ site }}</label>
                </div>
             </div>
          </div>
          <div v-else>
            <em class="text-muted">No subfolders found. Will scan root directory.</em>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 3: Assign Study -->
    <div v-if="currentStep === 3" class="step-content">
      <h5 class="mb-3">3. Assign to Study</h5>
      <div class="mb-3">
        <label class="form-label">Select Study</label>
        <select class="form-select" v-model="selectedStudyId">
          <option value="" disabled>Choose a study...</option>
          <option v-for="study in studies" :key="study.id" :value="study.id">
            {{ study.name }}
          </option>
        </select>
      </div>
      
      <div class="text-center my-2">- OR -</div>

      <div class="card">
        <div class="card-body">
          <h6 class="card-title">Create New Study</h6>
          <div class="mb-2">
            <input type="text" class="form-control" placeholder="New Study Name" v-model="newStudyName">
          </div>
          <div class="mb-2">
            <input type="text" class="form-control" placeholder="Description" v-model="newStudyDesc">
          </div>
          <button class="btn btn-sm btn-outline-primary" @click="createNewStudy" :disabled="!newStudyName">
            Create & Select
          </button>
        </div>
      </div>
    </div>

    <!-- Step 4: Summary & Confirm -->
    <div v-if="currentStep === 4" class="step-content">
      <h5 class="mb-3">4. Review & Import</h5>
      
      <div class="alert alert-info">
        <strong>Ready to Import:</strong>
        <ul class="mb-0 mt-2">
          <li v-for="item in finalSelectionPayload" :key="item.folder">
             Dataset: <strong>{{ item.folder }}</strong>
             <span v-if="item.sites.length > 0"> ({{ item.sites.length }} sites)</span>
             <span v-else> (Root scan)</span>
          </li>
        </ul>
        <div class="mt-2">Target Study: <strong>{{ getStudyName(selectedStudyId) }}</strong></div>
      </div>

      <div v-if="importing" class="text-center text-primary">
         <div class="spinner-border" role="status"></div>
         <p class="mt-2">Importing samples... This may take a while.</p>
      </div>

      <div v-if="importResult" class="mt-3">
        <div v-for="(res, idx) in importResult" :key="idx" 
             :class="['alert', res.status === 'success' ? 'alert-success' : 'alert-danger']">
           <strong>{{ res.dataset }}:</strong> 
           {{ res.message || `Added ${res.added} samples (${res.errors} errors)` }}
        </div>
      </div>
    </div>

    <!-- Navigation Buttons -->
    <div class="d-flex justify-content-between mt-4 pt-3 border-top">
      <button 
        class="btn btn-secondary" 
        @click="prevStep" 
        :disabled="currentStep === 1 || importing"
      >
        Previous
      </button>

      <button 
        v-if="currentStep < 4"
        class="btn btn-primary" 
        @click="nextStep"
        :disabled="!canProceed"
      >
        Next
      </button>

      <button 
        v-if="currentStep === 4"
        class="btn btn-success" 
        @click="runImport"
        :disabled="importing || importResult"
      >
        Start Import
      </button>
      
      <button 
        v-if="importResult"
        class="btn btn-primary"
        @click="$emit('finished')"
      >
        Done
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../../lib/api'

const emit = defineEmits(['finished'])

// State
const currentStep = ref(1)
const steps = ['Select Folders', 'Configure Sites', 'Assign Study', 'Import']
const loadingScan = ref(false)
const folders = ref([])
const selectedFolders = ref([])
const sitesMap = ref({}) // { "DatasetName": { hasSites: true, sites: ["site1"] } }
const siteSelections = ref({}) // { "DatasetName": { mode: "all"|"manual", selected: [] } }
const studies = ref([])
const selectedStudyId = ref('')
const newStudyName = ref('')
const newStudyDesc = ref('')
const importing = ref(false)
const importResult = ref(null)

// Computed
const canProceed = computed(() => {
  if (currentStep.value === 1) return selectedFolders.value.length > 0;
  if (currentStep.value === 2) return true; // Defaults are set
  if (currentStep.value === 3) return !!selectedStudyId.value;
  return false;
})

const finalSelectionPayload = computed(() => {
  return selectedFolders.value.map(folder => {
    const config = siteSelections.value[folder];
    const map = sitesMap.value[folder];
    
    let sites = [];
    if (map && map.hasSites) {
      if (config.mode === 'all') {
         sites = map.sites;
      } else {
         sites = config.selected;
      }
    }
    
    return {
      folder,
      sites
    }
  });
});

// Methods
function getStudyName(id) {
  const s = studies.value.find(x => x.id === id);
  return s ? s.name : id;
}

async function loadFolders() {
  loadingScan.value = true;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/admin/database/scan', {
       headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed scan');
    folders.value = await res.json();
  } catch (e) {
    console.error(e);
  } finally {
    loadingScan.value = false;
  }
}

async function loadSites() {
  loadingScan.value = true;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/admin/database/scan-sites', {
       method: 'POST',
       headers: { 
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${token}` 
       },
       body: JSON.stringify({ folders: selectedFolders.value })
    });
    const map = await res.json();
    sitesMap.value = map;

    // Initialize selections
    selectedFolders.value.forEach(f => {
       if (!siteSelections.value[f]) {
         siteSelections.value[f] = { mode: 'all', selected: [] };
       }
    });

  } catch (e) {
    console.error(e);
  } finally {
    loadingScan.value = false;
  }
}

async function loadStudies() {
  studies.value = await api.getStudies();
}

async function createNewStudy() {
  try {
    const study = await api.createStudy({ 
      name: newStudyName.value, 
      description: newStudyDesc.value 
    });
    studies.value.push(study);
    selectedStudyId.value = study.id;
    newStudyName.value = '';
    newStudyDesc.value = '';
  } catch (e) {
    alert('Failed to create study');
  }
}

async function nextStep() {
  if (currentStep.value === 1) {
    await loadSites();
  }
  if (currentStep.value === 2) {
    await loadStudies();
  }
  currentStep.value++;
}

function prevStep() {
  currentStep.value--;
}

async function runImport() {
  importing.value = true;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/admin/database/import', {
       method: 'POST',
       headers: { 
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${token}` 
       },
       body: JSON.stringify({
         studyId: selectedStudyId.value,
         selections: finalSelectionPayload.value
       })
    });
    const data = await res.json();
    if (data.success) {
      importResult.value = data.report;
    } else {
      alert(data.error);
    }
  } catch (e) {
    alert('Import failed: ' + e.message);
  } finally {
    importing.value = false;
  }
}

onMounted(() => {
  loadFolders();
});
</script>

<style scoped>
.steps {
  display: flex;
  justify-content: space-between;
  position: relative;
}
.steps::before {
  content: '';
  position: absolute;
  top: 15px;
  left: 0;
  right: 0;
  height: 2px;
  background: #dee2e6;
  z-index: 0;
}
.step-item {
  position: relative;
  z-index: 1;
  background: white;
  padding: 0 10px;
  text-align: center;
  opacity: 0.5;
}
.step-item.active, .step-item.completed {
  opacity: 1;
}
.step-circle {
  width: 32px;
  height: 32px;
  background: #6c757d;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 5px;
  font-weight: bold;
}
.active .step-circle {
  background: #0d6efd;
}
.completed .step-circle {
  background: #198754;
}
.cursor-pointer {
  cursor: pointer;
}
</style>
