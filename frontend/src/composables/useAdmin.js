/**
 * Admin composable - Shared utilities for admin views
 */

import { ref } from 'vue'
import api from '../lib/api'

/**
 * Alert management
 */
export function useAdminAlert() {
  const alert = ref({ show: false, type: 'success', message: '' })

  function showAlert(type, message) {
    alert.value = { show: true, type, message }
    setTimeout(() => { alert.value.show = false }, 5000)
  }

  return { alert, showAlert }
}

/**
 * Format date utility
 */
export function formatDate(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString()
}

/**
 * Data loading functions
 */
export function useAdminData() {
  const loading = ref(false)

  async function loadStats() {
    return await api.getAdminStats()
  }

  async function loadUsers() {
    return await api.getAdminUsers()
  }

  async function loadDatasets() {
    return await api.getAdminDatasets()
  }

  async function loadSamples(datasetId = null) {
    return await api.getAdminSamples(datasetId)
  }

  async function loadStudies() {
    return await api.getAdminStudies()
  }

  async function loadAccessGrants() {
    return await api.getAccessGrants()
  }

  return {
    loading,
    loadStats,
    loadUsers,
    loadDatasets,
    loadSamples,
    loadStudies,
    loadAccessGrants
  }
}

