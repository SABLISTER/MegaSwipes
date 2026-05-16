<template>
  <div class="admin-database-tab">
    <div class="row">

      <!-- ============================================================== -->
      <!-- TOP ROW: Quick Actions & Maintenance -->
      <!-- ============================================================== -->
      
      <!-- Maintenance Cards -->
      <div class="col-md-4 mb-4">
        <div class="card h-100">
          <div class="card-header bg-light">
             <i class="bi bi-tools"></i> Maintenance
          </div>
          <div class="card-body">
            <div class="d-grid gap-2">
              <button class="btn btn-outline-primary btn-sm text-start" @click="runBackup" :disabled="loading">
                 <i class="bi bi-hdd"></i> Backup Database
              </button>
              <button class="btn btn-outline-warning btn-sm text-start" @click="fixForeignKeys" :disabled="loading">
                 <i class="bi bi-shield-check"></i> Check Integrity (FK)
              </button>
              <button class="btn btn-outline-info btn-sm text-start" @click="addTokens" :disabled="loading">
                 <i class="bi bi-key"></i> Generate Secure Tokens
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick User Utils -->
      <div class="col-md-4 mb-4">
         <div class="card h-100 border-info">
            <div class="card-header bg-info-subtle">
               <i class="bi bi-people"></i> Quick User Utils
            </div>
            <div class="card-body">
               <div class="d-grid gap-2">
                  <button class="btn btn-outline-success btn-sm text-start" @click="showAddUserModal = true">
                     <i class="bi bi-person-plus"></i> Add New User
                  </button>
                  <button class="btn btn-outline-danger btn-sm text-start" @click="showResetPasswordModal = true">
                     <i class="bi bi-arrow-counterclockwise"></i> Reset User Password
                  </button>
               </div>
               <small class="text-muted mt-2 d-block">Helpers for common user management tasks.</small>
            </div>
         </div>
      </div>

      <!-- Import Card -->
      <div class="col-md-4 mb-4">
        <div class="card h-100">
          <div class="card-header bg-light">
             <i class="bi bi-cloud-upload"></i> Import
          </div>
          <div class="card-body d-flex flex-column">
             <p class="small">Import datasets from <code>data/images</code>.</p>
             <button class="btn btn-success mt-auto w-100" @click="showImportWizard = true">
                <i class="bi bi-magic"></i> Import Wizard
             </button>
          </div>
        </div>
      </div>
      
      <!-- ============================================================== -->
      <!-- MIDDLE ROW: Table Viewer -->
      <!-- ============================================================== -->

      <div class="col-12 mb-4">
         <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
               <span><i class="bi bi-table"></i> Database Explorer</span>
               <div class="d-flex gap-2">
                  <select v-model="selectedTable" class="form-select form-select-sm" style="width: 200px">
                     <option value="" disabled>Select Table...</option>
                     <option v-for="t in tables" :key="t" :value="t">{{ t }}</option>
                  </select>
                  <button class="btn btn-outline-secondary btn-sm" @click="exportTable" :disabled="!selectedTable">
                     <i class="bi bi-download"></i> Export CSV
                  </button>
                  <button class="btn btn-sm btn-primary" @click="loadTableData" :disabled="!selectedTable">
                     <i class="bi bi-arrow-clockwise"></i> Refresh
                  </button>
               </div>
            </div>
            <div class="card-body p-0">
               <div v-if="loadingTable" class="p-4 text-center text-muted">Loading table data...</div>
               <div v-else-if="!selectedTable" class="p-4 text-center text-muted">Select a table to view data.</div>
               <div v-else class="table-responsive" style="max-height: 500px">
                  <table class="table table-striped table-hover table-sm mb-0 font-monospace">
                     <thead class="table-light sticky-top">
                        <tr>
                           <th v-for="col in tableStructure" :key="col.name">{{ col.name }} <small class="text-muted">({{ col.type }})</small></th>
                        </tr>
                     </thead>
                     <tbody>
                        <tr v-for="(row, idx) in tableRows" :key="idx">
                           <td v-for="col in tableStructure" :key="col.name" class="text-truncate" style="max-width: 200px;">
                              {{ row[col.name] }}
                           </td>
                        </tr>
                     </tbody>
                  </table>
               </div>
               <div v-if="selectedTable" class="card-footer d-flex justify-content-between align-items-center py-1">
                  <small class="text-muted">Total: {{ tableTotal }} rows</small>
                  <div>
                     <button class="btn btn-sm btn-link" :disabled="tableOffset === 0" @click="prevPage">Prev</button>
                     <button class="btn btn-sm btn-link" :disabled="tableRows.length < tableLimit" @click="nextPage">Next</button>
                  </div>
               </div>
            </div>
         </div>
      </div>

      <!-- ============================================================== -->
      <!-- BOTTOM ROW: Advanced SQL -->
      <!-- ============================================================== -->

      <div class="col-12 mb-4">
        <div class="card border-warning">
          <div class="card-header bg-warning-subtle" role="button" @click="showSql = !showSql">
            <div class="d-flex justify-content-between">
               <span><i class="bi bi-terminal"></i> Advanced SQL Runner</span>
               <i :class="`bi bi-chevron-${showSql ? 'up' : 'down'}`"></i>
            </div>
          </div>
          <div class="card-body" v-show="showSql">
            <div class="mb-3">
              <textarea v-model="sqlQuery" class="form-control font-monospace" rows="3" placeholder="SELECT * FROM users LIMIT 5;"></textarea>
            </div>
            
            <div class="d-flex align-items-center gap-3">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" v-model="confirmSql">
                <label class="form-check-label text-danger fw-bold small">
                  I understand this executes raw SQL.
                </label>
              </div>
              <button class="btn btn-danger btn-sm ms-auto" @click="runSql" :disabled="!confirmSql || !sqlQuery || loading">
                Execute SQL
              </button>
            </div>

            <!-- Query Results -->
            <div v-if="queryResult" class="mt-3">
              <h6 class="border-bottom pb-2">Result: {{ queryResult.type }} <span class="badge bg-secondary" v-if="queryResult.changes !== undefined">Changes: {{ queryResult.changes }}</span></h6>
              
              <div v-if="queryResult.rows && queryResult.rows.length > 0" class="table-responsive" style="max-height: 300px">
                <table class="table table-sm table-striped font-monospace">
                  <thead>
                    <tr>
                      <th v-for="key in Object.keys(queryResult.rows[0])" :key="key">{{ key }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, i) in queryResult.rows" :key="i">
                      <td v-for="key in Object.keys(row)" :key="key">{{ row[key] }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else-if="queryResult.rows" class="text-muted">No rows returned.</div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <!-- Output Log -->
    <div v-if="logs.length > 0" class="card mt-2">
      <div class="card-header d-flex justify-content-between align-items-center py-1">
        <small>Operation Logs</small>
        <button class="btn btn-sm btn-link p-0" @click="logs = []">Clear</button>
      </div>
      <div class="card-body bg-dark text-light font-monospace p-2" style="max-height: 150px; overflow-y: auto; font-size: 0.8rem;">
        <div v-for="(log, i) in logs" :key="i">
          <span class="text-secondary">[{{ log.time }}]</span>
          <span :class="log.type === 'error' ? 'text-danger' : 'text-success'"> {{ log.message }}</span>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <div v-if="showImportWizard" class="modal fade show d-block" style="background: rgba(0,0,0,0.5)">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Filesystem Import Wizard</h5>
            <button type="button" class="btn-close" @click="showImportWizard = false"></button>
          </div>
          <div class="modal-body">
            <DatabaseImportWizard @finished="onImportFinished" />
          </div>
        </div>
      </div>
    </div>

    <!-- Add User Modal -->
    <div v-if="showAddUserModal" class="modal fade show d-block" style="background: rgba(0,0,0,0.5)">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Add New User</h5>
            <button type="button" class="btn-close" @click="showAddUserModal = false"></button>
          </div>
          <div class="modal-body">
             <form @submit.prevent="createUser">
                <div class="mb-3">
                   <label>Username</label>
                   <input v-model="newUser.username" class="form-control" required>
                </div>
                <div class="mb-3">
                   <label>Email</label>
                   <input v-model="newUser.email" type="email" class="form-control" required>
                </div>
                <div class="mb-3">
                   <label>Password</label>
                   <input v-model="newUser.password" type="password" class="form-control" required>
                </div>
                <div class="mb-3 form-check">
                   <input v-model="newUser.is_admin" type="checkbox" class="form-check-input" id="isAdminCheck">
                   <label class="form-check-label" for="isAdminCheck">Admin User</label>
                </div>
                <div class="text-end">
                   <button type="button" class="btn btn-secondary me-2" @click="showAddUserModal = false">Cancel</button>
                   <button type="submit" class="btn btn-success">Create User</button>
                </div>
             </form>
          </div>
        </div>
      </div>
    </div>

    <!-- Reset Password Modal -->
    <div v-if="showResetPasswordModal" class="modal fade show d-block" style="background: rgba(0,0,0,0.5)">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Reset User Password</h5>
            <button type="button" class="btn-close" @click="showResetPasswordModal = false"></button>
          </div>
          <div class="modal-body">
             <p class="text-muted">Enter the user's ID to reset their password.</p>
             <div class="mb-3 d-flex gap-2">
                 <input v-model="resetUserId" class="form-control" placeholder="User ID">
                 <!-- In a real app we'd have a user picker, but this is a utility -->
             </div>
             <div class="mb-3">
                <label>New Password</label>
                <div class="input-group">
                   <input v-model="newPasswordReset" class="form-control" placeholder="Leave empty for 'test1234'">
                   <button class="btn btn-outline-secondary" type="button" @click="newPasswordReset = 'test1234'">Default</button>
                </div>
                <small class="text-muted">Default: <code>test1234</code></small>
             </div>
             <div class="text-end">
                <button type="button" class="btn btn-secondary me-2" @click="showResetPasswordModal = false">Cancel</button>
                <button type="button" class="btn btn-danger" @click="resetPassword" :disabled="!resetUserId">Reset Password</button>
             </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import DatabaseImportWizard from './DatabaseImportWizard.vue'

const loading = ref(false)
const logs = ref([])
const showImportWizard = ref(false)
const showSql = ref(false)

// Table Viewer State
const tables = ref([])
const selectedTable = ref('')
const tableRows = ref([])
const tableStructure = ref([])
const tableTotal = ref(0)
const tableOffset = ref(0)
const tableLimit = 50
const loadingTable = ref(false)

// SQL Runner
const sqlQuery = ref('')
const confirmSql = ref(false)
const queryResult = ref(null)

// User Utils
const showAddUserModal = ref(false)
const newUser = ref({ username: '', email: '', password: '', is_admin: false })
const showResetPasswordModal = ref(false)
const resetUserId = ref('')
const newPasswordReset = ref('')

function addLog(message, type = 'info') {
  logs.value.unshift({
    time: new Date().toLocaleTimeString(),
    message,
    type
  })
}

function getAuthHeader() {
  return {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  }
}

// ==========================================================
// Initialization
// ==========================================================
onMounted(async () => {
   await loadTables()
})

async function loadTables() {
   try {
      const res = await fetch('/api/admin/database/tables', { headers: getAuthHeader() })
      if(res.ok) {
         tables.value = await res.json()
      }
   } catch(e) {
      console.error(e)
   }
}

watch(selectedTable, () => {
   tableOffset.value = 0
   loadTableData()
})

async function loadTableData() {
   if (!selectedTable.value) return
   loadingTable.value = true
   try {
      const res = await fetch(`/api/admin/database/tables/${selectedTable.value}/data?limit=${tableLimit}&offset=${tableOffset.value}`, { 
         headers: getAuthHeader() 
      })
      const data = await res.json()
      if (data.rows) {
         tableRows.value = data.rows
         tableTotal.value = data.total
         tableStructure.value = data.structure
      } else {
         addLog('Failed to load table data: ' + data.error, 'error')
      }
   } catch(e) {
      addLog('Load table error: ' + e.message, 'error')
   } finally {
      loadingTable.value = false
   }
}

function prevPage() {
   if (tableOffset.value >= tableLimit) {
      tableOffset.value -= tableLimit
      loadTableData()
   }
}

function nextPage() {
   if (tableRows.value.length === tableLimit) {
      tableOffset.value += tableLimit
      loadTableData()
   }
}

function exportTable() {
   if (!selectedTable.value) return
   window.location.href = `/api/admin/database/tables/${selectedTable.value}/export?token=${localStorage.getItem('token')}` // simple download trigger, assuming auth cookie or token param handling if needed.
   // NOTE: The backend endpoint is protected by Auth Header. Browser navigation won't send header.
   // We need to fetch blob and download.
   downloadTable()
}

async function downloadTable() {
   try {
      const res = await fetch(`/api/admin/database/tables/${selectedTable.value}/export`, { 
         headers: getAuthHeader() 
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${selectedTable.value}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
   } catch(e) {
      addLog('Export Error: ' + e.message, 'error')
   }
}


// ==========================================================
// SQL & Maintenance
// ==========================================================
async function runSql() {
  if (!confirmSql.value) return;
  
  loading.value = true
  queryResult.value = null
  try {
    const res = await fetch('/api/admin/database/query', { 
       method: 'POST', 
       headers: getAuthHeader(),
       body: JSON.stringify({ query: sqlQuery.value })
    })
    const data = await res.json()
    if (data.success) {
      addLog(`Query executed successfully.`, 'success')
      queryResult.value = data
    } else {
      throw new Error(data.error)
    }
  } catch (e) {
    addLog('Query Error: ' + e.message, 'error')
  } finally {
    loading.value = false
  }
}

async function runBackup() {
  loading.value = true
  addLog('Starting backup...', 'info')
  try {
    const res = await fetch('/api/admin/database/backup', { 
       method: 'POST', 
       headers: getAuthHeader() 
    })
    const data = await res.json()
    if (data.success) {
      addLog(`Backup complete! File: ${data.filename} (${data.sizeMB} MB)`, 'success')
    } else {
      throw new Error(data.error)
    }
  } catch (e) {
    addLog(e.message, 'error')
  } finally {
    loading.value = false
  }
}

async function fixForeignKeys() {
  loading.value = true
  addLog('Checking foreign keys...', 'info')
  try {
    const res = await fetch('/api/admin/database/maintenance/fix-fk', { 
       method: 'POST', 
       headers: getAuthHeader() 
    })
    const data = await res.json()
    if (data.success) {
      addLog(data.message, 'success')
      if (data.violations.length > 0) {
        addLog(`Violations: ${JSON.stringify(data.violations)}`, 'error')
      }
    } else {
      throw new Error(data.error)
    }
  } catch (e) {
    addLog(e.message, 'error')
  } finally {
    loading.value = false
  }
}

async function addTokens() {
  loading.value = true
  addLog('Generating secure tokens...', 'info')
  try {
    const res = await fetch('/api/admin/database/maintenance/add-tokens', { 
       method: 'POST', 
       headers: getAuthHeader() 
    })
    const data = await res.json()
    if (data.success) {
      addLog(data.message, 'success')
    } else {
      throw new Error(data.error)
    }
  } catch (e) {
    addLog(e.message, 'error')
  } finally {
    loading.value = false
  }
}

function onImportFinished() {
  showImportWizard.value = false
  addLog('Import wizard completed.', 'success')
}

// ==========================================================
// User Utils
// ==========================================================
async function createUser() {
   loading.value = true
   try {
      const res = await fetch('/api/admin/users', { 
         method: 'POST', 
         headers: getAuthHeader(),
         body: JSON.stringify(newUser.value)
      })
      const data = await res.json()
      if (res.ok) {
         addLog(`User ${data.username} created.`, 'success')
         showAddUserModal.value = false
         newUser.value = { username: '', email: '', password: '', is_admin: false }
      } else {
         addLog('Create User Failed: ' + data.error, 'error')
      }
   } catch(e) {
      addLog('Create User Error: ' + e.message, 'error')
   } finally {
      loading.value = false
   }
}

async function resetPassword() {
   if(!resetUserId.value) return
   loading.value = true
   try {
      const res = await fetch(`/api/admin/users/${resetUserId.value}/reset-password`, { 
         method: 'POST', 
         headers: getAuthHeader(),
         body: JSON.stringify({ password: newPasswordReset.value || 'test1234' })
      })
      const data = await res.json()
      if (data.success) {
         addLog(`Password for user ${resetUserId.value} reset.`, 'success')
         showResetPasswordModal.value = false
         resetUserId.value = ''
         newPasswordReset.value = ''
      } else {
         addLog('Reset Failed: ' + data.error, 'error')
      }
   } catch(e) {
      addLog('Reset Error: ' + e.message, 'error')
   } finally {
      loading.value = false
   }
}
</script>

<style scoped>
.font-monospace {
  font-family: monospace;
  font-size: 0.9em;
}
.table-responsive {
   border: 1px solid #dee2e6;
}
</style>
