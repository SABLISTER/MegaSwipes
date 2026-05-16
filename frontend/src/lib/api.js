// API client for CMI NeuroQC Offline
// Replaces Supabase client with local API calls

// Dynamically determine API URL based on current hostname
function getApiBaseUrl() {
  // Use environment variable if set
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Detect hostname from current location
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';

  // Use current hostname (works for both localhost and megaswipes domain)
  // If accessing via megaswipes:5173, API will be megaswipes:3000
  // If accessing via localhost:5173, API will be localhost:3000
  const apiHost = hostname;

  return `${protocol}//${apiHost}:3000/api`;
}

const API_BASE_URL = getApiBaseUrl();

class ApiClient {
  constructor() {
    // Token will be read from localStorage when needed
  }

  get token() {
    return localStorage.getItem('token');
  }

  setToken(token) {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return null;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      // Enhance error message for connection issues
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Backend server is not available. Please wait a moment and try again.');
      }
      throw error;
    }
  }

  // Auth methods
  async signUp(username, email, password, consent) {
    const data = await this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, consent }),
    });
    this.setToken(data.token);
    return data;
  }

  async signIn(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async signOut() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }

  async getUser() {
    return this.request('/auth/me');
  }

  // Dataset methods
  async getDatasets() {
    return this.request('/datasets');
  }

  async getDataset(id) {
    return this.request(`/datasets/${id}`);
  }

  async getDatasetSamples(datasetId) {
    return this.request(`/datasets/${datasetId}/samples`);
  }

  // Sample methods
  async getSample(id) {
    return this.request(`/samples/${id}`);
  }

  // Vote methods
  async createVote(sampleId, rating, comment = '', filename) {
    return this.request('/votes', {
      method: 'POST',
      body: JSON.stringify({
        sample_id: sampleId,
        vote: rating > 0 ? 1 : 0,
        rating,
        comment,
        filename,
      }),
    });
  }

  async getMyVotes() {
    return this.request('/votes/my');
  }

  // Leaderboard methods
  async getLeaderboard() {
    return this.request('/leaderboard');
  }

  // Admin methods - User Management
  async getAdminUsers() {
    return this.request('/admin/users');
  }

  async getAdminUser(id) {
    return this.request(`/admin/users/${id}`);
  }

  async updateUser(id, data) {
    return this.request(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id) {
    return this.request(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  // Admin methods - Dataset Management
  async getAdminDatasets() {
    return this.request('/admin/datasets');
  }

  async createDataset(data) {
    return this.request('/admin/datasets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateDataset(id, data) {
    return this.request(`/admin/datasets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteDataset(id) {
    return this.request(`/admin/datasets/${id}`, {
      method: 'DELETE',
    });
  }

  // Admin methods - Sample Management
  async getAdminSamples(datasetId = null) {
    const query = datasetId ? `?dataset_id=${datasetId}` : '';
    return this.request(`/admin/samples${query}`);
  }

  async bulkImportSamples(datasetId) {
    return this.request('/admin/samples/bulk', {
      method: 'POST',
      body: JSON.stringify({ dataset_id: datasetId }),
    });
  }

  async deleteSample(id) {
    return this.request(`/admin/samples/${id}`, {
      method: 'DELETE',
    });
  }

  // Admin methods - Study Management
  async getAdminStudies() {
    return this.request('/admin/studies');
  }

  async createStudy(data) {
    return this.request('/admin/studies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateStudy(id, data) {
    return this.request(`/admin/studies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteStudy(id) {
    return this.request(`/admin/studies/${id}`, {
      method: 'DELETE',
    });
  }

  // Admin methods - Access Control
  async getAccessGrants() {
    return this.request('/admin/access');
  }

  async grantAccess(userId, datasetId) {
    return this.request(`/admin/users/${userId}/access/${datasetId}`, {
      method: 'POST',
    });
  }

  async revokeAccess(userId, datasetId) {
    return this.request(`/admin/users/${userId}/access/${datasetId}`, {
      method: 'DELETE',
    });
  }

  // Admin methods - Statistics
  async getAdminStats() {
    return this.request('/admin/stats');
  }

  // Admin methods - Swipe Statistics
  async getSwipeStats() {
    return this.request('/admin/swipe-stats');
  }

  // Admin methods - SSH Management
  async getSSHStatus() {
    return this.request('/admin/ssh/status');
  }

  async testSSHConnection() {
    return this.request('/admin/ssh/test', {
      method: 'POST',
    });
  }

  async scanSSHDatasets() {
    return this.request('/admin/ssh/scan', {
      method: 'POST',
    });
  }

  async importSSHDataset(datasetName, fullScan = false) {
    return this.request(`/admin/ssh/import/${datasetName}`, {
      method: 'POST',
      body: JSON.stringify({ fullScan }),
    });
  }

  async refreshSSHDataset(datasetId) {
    return this.request(`/admin/ssh/refresh/${datasetId}`, {
      method: 'POST',
    });
  }

  async clearSSHCache(datasetName = null) {
    const endpoint = datasetName
      ? `/admin/ssh/cache/${datasetName}`
      : '/admin/ssh/cache';
    return this.request(endpoint, {
      method: 'DELETE',
    });
  }

  // Admin methods - Dataset Splits
  async getDatasetSplits(datasetId) {
    return this.request(`/admin/splits/${datasetId}`);
  }

  async createDatasetSplit(datasetId, data) {
    return this.request(`/admin/splits/${datasetId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteDatasetSplit(splitId) {
    return this.request(`/admin/splits/${splitId}`, {
      method: 'DELETE',
    });
  }

  async getSplitAssignments(splitId) {
    return this.request(`/admin/splits/${splitId}/assignments`);
  }

  async getMyAssignments(datasetId) {
    return this.request(`/my-assignments/${datasetId}`);
  }

  async getSplitComments(splitId) {
    return this.request(`/admin/splits/${splitId}/comments`);
  }

  async getSitesEulerStats() {
    return this.request('/admin/stats/sites-euler');
  }

  async getAdvancedStats() {
    return this.request('/admin/stats/advanced');
  }

  // Admin methods - Image Upload
  async uploadSingleImage(formData) {
    // Remove Content-Type header for FormData (browser will set it with boundary)
    const headers = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE_URL}/admin/upload/single`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async uploadBatchImages(formData) {
    // Remove Content-Type header for FormData (browser will set it with boundary)
    const headers = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE_URL}/admin/upload/batch`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Admin methods - Assignments
  async createAssignment(sampleId, userId, assignmentType = 'individual') {
    return this.request('/admin/assignments', {
      method: 'POST',
      body: JSON.stringify({
        sample_id: sampleId,
        user_id: userId,
        assignment_type: assignmentType
      }),
    });
  }

  async bulkAssignSamples(sampleIds, userIds, assignmentType = 'individual') {
    return this.request('/admin/assignments/bulk', {
      method: 'POST',
      body: JSON.stringify({
        sample_ids: sampleIds,
        user_ids: userIds,
        assignment_type: assignmentType
      }),
    });
  }

  async getAssignments(queryParams = '') {
    return this.request(`/admin/assignments${queryParams}`);
  }

  async deleteAssignment(assignmentId) {
    return this.request(`/admin/assignments/${assignmentId}`, {
      method: 'DELETE',
    });
  }

  async getAssignmentStats() {
    return this.request('/admin/assignments/stats');
  }

  // Image URL helpers
  getSecureImageUrl(secureToken) {
    if (!secureToken) return '';

    // Dynamically determine base URL
    let baseUrl;
    if (import.meta.env.VITE_API_URL) {
      baseUrl = import.meta.env.VITE_API_URL.replace('/api', '');
    } else {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
      // Use current hostname (works for both localhost and megaswipes domain)
      baseUrl = `${protocol}//${hostname}:3000`;
    }

    return `${baseUrl}/images/${secureToken}`;
  }
}

export const api = new ApiClient();
export default api;

