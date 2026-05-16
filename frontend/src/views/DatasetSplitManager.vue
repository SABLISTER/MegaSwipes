<template>
  <div class="split-manager">
    <div class="header">
      <h2>Dataset Split Manager</h2>
      <p class="subtitle">Configure inter-rater reliability splits and workload distribution</p>
    </div>

    <!-- Dataset Selection -->
    <div class="dataset-selector">
      <label>Select Dataset:</label>
      <select v-model="selectedDatasetId" @change="loadSplits">
        <option value="">-- Choose a dataset --</option>
        <option v-for="dataset in datasets" :key="dataset.id" :value="dataset.id">
          {{ dataset.name }} ({{ dataset.sample_count }} samples)
        </option>
      </select>
    </div>

    <div v-if="selectedDatasetId" class="split-content">
      <!-- Existing Splits -->
      <div v-if="splits.length > 0" class="existing-splits">
        <h3>Existing Splits</h3>
        <div v-for="split in splits" :key="split.id" class="split-card">
          <div class="split-header">
            <div>
              <h4>{{ split.name }}</h4>
              <p class="split-desc">{{ split.description }}</p>
              <p class="split-meta">
                Created by {{ split.created_by_username }} on {{ formatDate(split.created_at) }}
              </p>
            </div>
            <button @click="deleteSplit(split.id)" class="btn-delete">Delete</button>
          </div>
          
          <div class="split-details">
            <!-- Summary Cards -->
            <div class="summary-cards">
              <div class="summary-card">
                <div class="summary-value">{{ selectedDataset.sample_count }}</div>
                <div class="summary-label">Total Samples</div>
              </div>
              <div class="summary-card">
                <div class="summary-value">{{ Math.floor(selectedDataset.sample_count * split.overlap_percentage / 100) }}</div>
                <div class="summary-label">Overlap Samples</div>
              </div>
              <div class="summary-card">
                <div class="summary-value">{{ split.allocations.length }}</div>
                <div class="summary-label">Users</div>
              </div>
            </div>

            <div class="overlap-info">
              <strong>Overlap:</strong> {{ split.overlap_percentage }}% 
              ({{ Math.floor(selectedDataset.sample_count * split.overlap_percentage / 100) }} samples rated by all)
            </div>
            
            <!-- Visual Distribution Chart for Existing Split -->
            <div class="distribution-chart-container" v-if="split.allocations.length > 0">
              <h5>Distribution Visualization</h5>
              <div class="chart-wrapper" style="height: 300px;">
                <canvas :data-split-id="split.id" style="max-height: 300px;"></canvas>
              </div>
            </div>
            
            <div class="allocations">
              <h5>User Allocations:</h5>
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Percentage</th>
                    <th>Sample Count</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="alloc in split.allocations" :key="alloc.id">
                    <td>{{ alloc.username }} ({{ alloc.email }})</td>
                    <td>{{ alloc.percentage }}%</td>
                    <td>{{ alloc.sample_count }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Comments Section -->
            <div class="comments-section">
              <div class="comments-header">
                <h5>Comments</h5>
                <button 
                  @click="expandedComments[split.id] = !expandedComments[split.id]"
                  class="btn-toggle-comments"
                >
                  {{ expandedComments[split.id] ? 'Hide' : 'Show' }} Comments
                </button>
              </div>
              
              <div v-if="expandedComments[split.id]" class="comments-content">
                <div class="comment-stats">
                  <span>Total: {{ commentStats(split.id).total }}</span>
                  <span>Avg Length: {{ commentStats(split.id).averageLength }} chars</span>
                </div>
                
                <div class="comment-filters">
                  <select v-model="commentFilter.user" class="form-select-sm">
                    <option value="">All Users</option>
                    <option v-for="alloc in split.allocations" :key="alloc.user_id" :value="alloc.user_id">
                      {{ alloc.username }}
                    </option>
                  </select>
                  <input 
                    v-model="commentFilter.date" 
                    type="date" 
                    class="form-control-sm"
                    placeholder="Filter by date"
                  />
                </div>
                
                <div class="comments-list">
                  <div 
                    v-for="comment in filteredComments(split.id)" 
                    :key="comment.id"
                    class="comment-item"
                  >
                    <div class="comment-header">
                      <strong>{{ comment.username || 'Unknown' }}</strong>
                      <span class="comment-date">{{ formatDate(comment.created_at) }}</span>
                    </div>
                    <div class="comment-text">{{ comment.comment || '(No comment)' }}</div>
                  </div>
                  <div v-if="filteredComments(split.id).length === 0" class="no-comments">
                    No comments found
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Create New Split -->
      <div class="create-split">
        <h3>Create New Split</h3>
        
        <div class="form-group">
          <label>Split Name:</label>
          <input v-model="newSplit.name" type="text" placeholder="e.g., IRR Study 2025" />
        </div>

        <div class="form-group">
          <label>Description (optional):</label>
          <textarea v-model="newSplit.description" placeholder="Purpose of this split..."></textarea>
        </div>

        <div class="form-group">
          <label>Overlap Percentage (all raters):</label>
          <div class="slider-group">
            <input 
              v-model.number="newSplit.overlap_percentage" 
              type="range" 
              min="0" 
              max="100" 
              step="1"
            />
            <span class="slider-value">{{ newSplit.overlap_percentage }}%</span>
            <span class="sample-count">
              ({{ Math.floor(selectedDataset.sample_count * newSplit.overlap_percentage / 100) }} samples)
            </span>
          </div>
        </div>

        <div class="form-group">
          <label>Remaining: {{ 100 - newSplit.overlap_percentage }}% to distribute</label>
        </div>

        <!-- Visual Distribution Chart -->
        <div class="distribution-chart-container" v-if="distributionChartData">
          <h4>Distribution Preview</h4>
          <div class="chart-wrapper" style="height: 300px;">
            <canvas ref="distributionCanvas"></canvas>
          </div>
        </div>

        <!-- User Selection (Multi-select) -->
        <div class="user-selection-section">
          <h4>Select Users</h4>
          <div class="user-search">
            <input 
              v-model="userSearchFilter" 
              type="text" 
              placeholder="Search users by name or email..."
              class="form-control"
            />
          </div>
          <div class="user-selection-actions">
            <button @click="selectAllUsers" class="btn-sm btn-outline-primary">Select All</button>
            <button @click="deselectAllUsers" class="btn-sm btn-outline-secondary">Deselect All</button>
            <button @click="addAllocation" class="btn-sm btn-primary">Add Selected Users</button>
          </div>
          <div class="user-checkbox-list">
            <div 
              v-for="user in filteredUsers" 
              :key="user.id"
              class="user-checkbox-item"
              :class="{ selected: selectedUsersForAllocation.includes(user.id) }"
            >
              <input 
                type="checkbox" 
                :id="`user-${user.id}`"
                :checked="selectedUsersForAllocation.includes(user.id)"
                @change="toggleUserSelection(user.id)"
              />
              <label :for="`user-${user.id}`">
                <span class="user-avatar">{{ user.username.charAt(0).toUpperCase() }}</span>
                <span class="user-info">
                  <strong>{{ user.username }}</strong>
                  <small>{{ user.email }}</small>
                </span>
              </label>
            </div>
          </div>
        </div>

        <!-- User Allocations -->
        <div class="allocations-editor">
          <h4>User Allocations</h4>
          
          <div class="bulk-actions">
            <button @click="equalDistribution" class="btn-sm btn-outline-primary">Equal Distribution</button>
            <button @click="clearAllAllocations" class="btn-sm btn-outline-secondary">Clear All</button>
            <button @click="distributeRemaining" class="btn-sm btn-outline-success">Distribute Remaining</button>
          </div>
          
          <div v-for="(alloc, index) in newSplit.allocations" :key="index" class="allocation-row" :class="{ highlighted: highlightedUser === alloc.user_id }">
            <div class="user-info-display">
              <span class="user-avatar-small">{{ availableUsers.find(u => u.id === alloc.user_id)?.username?.charAt(0).toUpperCase() || '?' }}</span>
              <span>{{ availableUsers.find(u => u.id === alloc.user_id)?.username || 'No user selected' }}</span>
            </div>
            
            <div class="slider-container">
              <div class="slider-controls">
                <button @click="adjustPercentage(index, -10)" class="btn-adjust">-10%</button>
                <button @click="adjustPercentage(index, -5)" class="btn-adjust">-5%</button>
                <input 
                  v-model.number="alloc.percentage" 
                  type="range" 
                  min="0" 
                  :max="100 - newSplit.overlap_percentage"
                  step="0.1"
                  class="percentage-slider"
                />
                <button @click="adjustPercentage(index, 5)" class="btn-adjust">+5%</button>
                <button @click="adjustPercentage(index, 10)" class="btn-adjust">+10%</button>
              </div>
              <div class="percentage-display">
                <input 
                  v-model.number="alloc.percentage" 
                  type="number" 
                  min="0" 
                  :max="100 - newSplit.overlap_percentage"
                  step="0.1"
                  class="percentage-input-number"
                />
                <span>%</span>
                <span class="sample-count">
                  ({{ Math.floor(selectedDataset.sample_count * (100 - newSplit.overlap_percentage) / 100 * alloc.percentage / 100) }} samples)
                </span>
              </div>
            </div>
            
            <button @click="removeAllocation(index)" class="btn-remove">Remove</button>
          </div>
          
          <div class="allocation-summary">
            <strong>Total Allocated:</strong> {{ totalAllocated.toFixed(1) }}% / {{ 100 - newSplit.overlap_percentage }}%
            <span v-if="totalAllocated > 100 - newSplit.overlap_percentage" class="error">
              ⚠️ Exceeds available percentage!
            </span>
            <span v-else-if="totalAllocated < 100 - newSplit.overlap_percentage" class="warning">
              ⚠️ {{ (100 - newSplit.overlap_percentage - totalAllocated).toFixed(1) }}% remaining
            </span>
            <span v-else class="success">
              ✓ Fully allocated
            </span>
          </div>
        </div>

        <div class="form-actions">
          <button 
            @click="createSplit" 
            :disabled="!canCreateSplit"
            class="btn-primary"
          >
            Create Split
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { Chart, registerables } from 'chart.js';
import api from '../lib/api';

Chart.register(...registerables);

export default {
  name: 'DatasetSplitManager',
  
  setup() {
    const datasets = ref([]);
    const users = ref([]);
    const selectedDatasetId = ref('');
    const splits = ref([]);
    const userSearchFilter = ref('');
    const selectedUsersForAllocation = ref([]);
    const comments = ref({});
    const expandedComments = ref({});
    const commentFilter = ref({ user: '', date: '' });
    const distributionChart = ref(null);
    const distributionCanvas = ref(null);
    const highlightedUser = ref(null);
    
    const newSplit = ref({
      name: '',
      description: '',
      overlap_percentage: 15,
      allocations: []
    });

    const selectedDataset = computed(() => {
      return datasets.value.find(d => d.id == selectedDatasetId.value) || { sample_count: 0 };
    });

    const availableUsers = computed(() => {
      return users.value.filter(u => !u.is_admin || u.is_admin === 0);
    });

    const filteredUsers = computed(() => {
      const filtered = availableUsers.value.filter(u => {
        const searchTerm = userSearchFilter.value.toLowerCase();
        return !searchTerm || 
               u.username.toLowerCase().includes(searchTerm) ||
               u.email.toLowerCase().includes(searchTerm);
      });
      return filtered;
    });

    const selectedUsersData = computed(() => {
      return selectedUsersForAllocation.value.map(userId => {
        return availableUsers.value.find(u => u.id === userId);
      }).filter(Boolean);
    });

    const totalAllocated = computed(() => {
      return newSplit.value.allocations.reduce((sum, a) => sum + (a.percentage || 0), 0);
    });

    const canCreateSplit = computed(() => {
      return newSplit.value.name && 
             newSplit.value.allocations.length > 0 &&
             newSplit.value.allocations.every(a => a.user_id && a.percentage > 0) &&
             totalAllocated.value <= 100 - newSplit.value.overlap_percentage;
    });

    const distributionChartData = computed(() => {
      if (!selectedDatasetId.value || newSplit.value.allocations.length === 0) return null;
      
      const overlapCount = Math.floor(selectedDataset.value.sample_count * newSplit.value.overlap_percentage / 100);
      const remainingCount = selectedDataset.value.sample_count - overlapCount;
      
      const labels = ['Overlap (All Users)'];
      const data = [overlapCount];
      const colors = ['rgba(255, 206, 86, 0.8)'];
      
      newSplit.value.allocations.forEach((alloc, index) => {
        if (alloc.user_id) {
          const user = availableUsers.value.find(u => u.id === alloc.user_id);
          if (user) {
            const individualCount = Math.floor(remainingCount * alloc.percentage / 100);
            labels.push(user.username);
            data.push(individualCount);
            colors.push(`hsl(${(index * 360) / newSplit.value.allocations.length}, 70%, 60%)`);
          }
        }
      });
      
      return { labels, data, colors };
    });

    const loadDatasets = async () => {
      try {
        const data = await api.getAdminDatasets();
        datasets.value = data;
      } catch (error) {
        console.error('Failed to load datasets:', error);
        alert('Failed to load datasets');
      }
    };

    const loadUsers = async () => {
      try {
        const data = await api.getAdminUsers();
        users.value = data;
      } catch (error) {
        console.error('Failed to load users:', error);
      }
    };

    const loadSplits = async () => {
      if (!selectedDatasetId.value) {
        splits.value = [];
        return;
      }

      try {
        const data = await api.getDatasetSplits(selectedDatasetId.value);
        splits.value = data;
        // Load comments for each split
        for (const split of splits.value) {
          await loadCommentsForSplit(split.id);
        }
        // Render charts for existing splits
        nextTick(() => {
          renderExistingSplitCharts();
        });
      } catch (error) {
        console.error('Failed to load splits:', error);
        alert('Failed to load splits');
      }
    };

    const splitCharts = ref({});

    const renderExistingSplitCharts = () => {
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => {
        splits.value.forEach(split => {
          if (split.allocations && split.allocations.length > 0) {
            const canvas = document.querySelector(`canvas[data-split-id="${split.id}"]`);
            if (canvas) {
              renderSplitChart(split, canvas);
            }
          }
        });
      }, 100);
    };

    const renderSplitChart = (split, canvas) => {
      if (!canvas || !split.allocations) return;
      
      // Destroy existing chart if any
      if (splitCharts.value[split.id]) {
        splitCharts.value[split.id].destroy();
      }
      
      const overlapCount = Math.floor(selectedDataset.value.sample_count * split.overlap_percentage / 100);
      const remainingCount = selectedDataset.value.sample_count - overlapCount;
      
      const labels = ['Overlap (All Users)'];
      const data = [overlapCount];
      const colors = ['rgba(255, 206, 86, 0.8)'];
      
      split.allocations.forEach((alloc, index) => {
        const individualCount = Math.floor(remainingCount * alloc.percentage / 100);
        labels.push(alloc.username || 'Unknown');
        data.push(individualCount);
        colors.push(`hsl(${(index * 360) / split.allocations.length}, 70%, 60%)`);
      });
      
      const ctx = canvas.getContext('2d');
      splitCharts.value[split.id] = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Sample Count',
            data: data,
            backgroundColor: colors,
            borderColor: colors.map(c => c.replace('0.8', '1')),
            borderWidth: 2
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `${context.parsed.x} samples`;
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Number of Samples'
              }
            },
            y: {
              title: {
                display: true,
                text: 'Users / Overlap'
              }
            }
          }
        }
      });
    };

    const loadCommentsForSplit = async (splitId) => {
      try {
        const data = await api.getSplitComments(splitId);
        comments.value[splitId] = data;
      } catch (error) {
        console.error('Failed to load comments:', error);
        comments.value[splitId] = [];
      }
    };

    const getCommentsForSplit = (splitId) => {
      return comments.value[splitId] || [];
    };

    const filteredComments = (splitId) => {
      const allComments = getCommentsForSplit(splitId);
      if (!commentFilter.value.user && !commentFilter.value.date) {
        return allComments;
      }
      return allComments.filter(comment => {
        if (commentFilter.value.user && comment.user_id !== commentFilter.value.user) {
          return false;
        }
        if (commentFilter.value.date) {
          const commentDate = new Date(comment.created_at).toDateString();
          const filterDate = new Date(commentFilter.value.date).toDateString();
          return commentDate === filterDate;
        }
        return true;
      });
    };

    const commentStats = (splitId) => {
      const allComments = getCommentsForSplit(splitId);
      return {
        total: allComments.length,
        averageLength: allComments.length > 0 
          ? Math.round(allComments.reduce((sum, c) => sum + (c.comment?.length || 0), 0) / allComments.length)
          : 0,
        byUser: allComments.reduce((acc, c) => {
          acc[c.user_id] = (acc[c.user_id] || 0) + 1;
          return acc;
        }, {})
      };
    };

    const addAllocation = () => {
      if (selectedUsersForAllocation.value.length === 0) {
        alert('Please select users first');
        return;
      }
      // Add allocations for selected users that aren't already allocated
      const existingUserIds = newSplit.value.allocations.map(a => a.user_id);
      selectedUsersForAllocation.value.forEach(userId => {
        if (!existingUserIds.includes(userId)) {
          newSplit.value.allocations.push({ user_id: userId, percentage: 0 });
        }
      });
      selectedUsersForAllocation.value = [];
    };

    const toggleUserSelection = (userId) => {
      const index = selectedUsersForAllocation.value.indexOf(userId);
      if (index > -1) {
        selectedUsersForAllocation.value.splice(index, 1);
      } else {
        selectedUsersForAllocation.value.push(userId);
      }
    };

    const selectAllUsers = () => {
      selectedUsersForAllocation.value = filteredUsers.value.map(u => u.id);
    };

    const deselectAllUsers = () => {
      selectedUsersForAllocation.value = [];
    };

    const equalDistribution = () => {
      const remaining = 100 - newSplit.value.overlap_percentage;
      const count = newSplit.value.allocations.filter(a => a.user_id).length;
      if (count === 0) return;
      const perUser = remaining / count;
      newSplit.value.allocations.forEach(alloc => {
        if (alloc.user_id) {
          alloc.percentage = Math.round(perUser * 100) / 100;
        }
      });
    };

    const clearAllAllocations = () => {
      newSplit.value.allocations.forEach(alloc => {
        alloc.percentage = 0;
      });
    };

    const distributeRemaining = () => {
      const remaining = 100 - newSplit.value.overlap_percentage - totalAllocated.value;
      const count = newSplit.value.allocations.filter(a => a.user_id && a.percentage > 0).length;
      if (count === 0) return;
      const perUser = remaining / count;
      newSplit.value.allocations.forEach(alloc => {
        if (alloc.user_id && alloc.percentage > 0) {
          alloc.percentage = Math.round((alloc.percentage + perUser) * 100) / 100;
        }
      });
    };

    const adjustPercentage = (index, delta) => {
      const alloc = newSplit.value.allocations[index];
      const max = 100 - newSplit.value.overlap_percentage;
      const newValue = Math.max(0, Math.min(max, alloc.percentage + delta));
      alloc.percentage = newValue;
    };

    const updateDistributionChart = () => {
      if (!distributionCanvas.value || !distributionChartData.value) return;
      
      if (distributionChart.value) {
        distributionChart.value.destroy();
      }
      
      const ctx = distributionCanvas.value.getContext('2d');
      distributionChart.value = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: distributionChartData.value.labels,
          datasets: [{
            label: 'Sample Count',
            data: distributionChartData.value.data,
            backgroundColor: distributionChartData.value.colors,
            borderColor: distributionChartData.value.colors.map(c => c.replace('0.8', '1')),
            borderWidth: 2
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `${context.parsed.x} samples`;
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Number of Samples'
              }
            },
            y: {
              title: {
                display: true,
                text: 'Users / Overlap'
              }
            }
          },
          onClick: (event, elements) => {
            if (elements.length > 0) {
              const index = elements[0].index;
              if (index > 0) {
                const alloc = newSplit.value.allocations[index - 1];
                highlightedUser.value = alloc.user_id;
                setTimeout(() => {
                  highlightedUser.value = null;
                }, 2000);
              }
            }
          }
        }
      });
    };

    watch([() => newSplit.value.allocations, () => newSplit.value.overlap_percentage, selectedDataset], () => {
      nextTick(() => {
        updateDistributionChart();
      });
    }, { deep: true });

    watch(splits, () => {
      nextTick(() => {
        renderExistingSplitCharts();
      });
    }, { deep: true });

    const removeAllocation = (index) => {
      newSplit.value.allocations.splice(index, 1);
    };

    const createSplit = async () => {
      if (!canCreateSplit.value) return;

      try {
        await api.createDatasetSplit(selectedDatasetId.value, newSplit.value);
        
        // Reset form
        newSplit.value = {
          name: '',
          description: '',
          overlap_percentage: 15,
          allocations: [
            { user_id: '', percentage: 70 },
            { user_id: '', percentage: 70 },
            { user_id: '', percentage: 30 },
            { user_id: '', percentage: 30 }
          ]
        };
        
        // Reload splits
        await loadSplits();
        
        alert('Split created successfully!');
      } catch (error) {
        console.error('Failed to create split:', error);
        alert(error.message || 'Failed to create split');
      }
    };

    const deleteSplit = async (splitId) => {
      if (!confirm('Are you sure you want to delete this split? This will remove all sample assignments.')) {
        return;
      }

      try {
        await api.deleteDatasetSplit(splitId);
        await loadSplits();
        alert('Split deleted successfully');
      } catch (error) {
        console.error('Failed to delete split:', error);
        alert(error.message || 'Failed to delete split');
      }
    };

    const formatDate = (dateString) => {
      return new Date(dateString).toLocaleString();
    };

    onMounted(() => {
      loadDatasets();
      loadUsers();
    });

    return {
      datasets,
      users,
      selectedDatasetId,
      selectedDataset,
      splits,
      newSplit,
      availableUsers,
      filteredUsers,
      selectedUsersForAllocation,
      selectedUsersData,
      userSearchFilter,
      comments,
      expandedComments,
      commentFilter,
      distributionCanvas,
      highlightedUser,
      totalAllocated,
      canCreateSplit,
      distributionChartData,
      splitCharts,
      loadSplits,
      loadCommentsForSplit,
      getCommentsForSplit,
      filteredComments,
      commentStats,
      renderExistingSplitCharts,
      renderSplitChart,
      addAllocation,
      removeAllocation,
      toggleUserSelection,
      selectAllUsers,
      deselectAllUsers,
      equalDistribution,
      clearAllAllocations,
      distributeRemaining,
      adjustPercentage,
      createSplit,
      deleteSplit,
      formatDate
    };
  }
};
</script>

<style scoped>
.split-manager {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  margin-bottom: 30px;
}

.header h2 {
  margin: 0 0 10px 0;
  color: #2c3e50;
}

.subtitle {
  color: #7f8c8d;
  margin: 0;
}

.dataset-selector {
  margin-bottom: 30px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.dataset-selector label {
  display: block;
  margin-bottom: 10px;
  font-weight: 600;
}

.dataset-selector select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
}

.existing-splits {
  margin-bottom: 40px;
}

.existing-splits h3 {
  margin-bottom: 20px;
  color: #2c3e50;
}

.split-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.split-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e0e0e0;
}

.split-header h4 {
  margin: 0 0 5px 0;
  color: #2c3e50;
}

.split-desc {
  color: #7f8c8d;
  margin: 5px 0;
}

.split-meta {
  font-size: 0.9em;
  color: #95a5a6;
  margin: 5px 0 0 0;
}

.split-details {
  margin-top: 15px;
}

.overlap-info {
  background: #e3f2fd;
  padding: 10px 15px;
  border-radius: 4px;
  margin-bottom: 15px;
}

.allocations h5 {
  margin: 15px 0 10px 0;
  color: #2c3e50;
}

.allocations table {
  width: 100%;
  border-collapse: collapse;
}

.allocations th,
.allocations td {
  padding: 10px;
  text-align: left;
  border-bottom: 1px solid #e0e0e0;
}

.allocations th {
  background: #f8f9fa;
  font-weight: 600;
}

.create-split {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 25px;
}

.create-split h3 {
  margin: 0 0 20px 0;
  color: #2c3e50;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #2c3e50;
}

.form-group input[type="text"],
.form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-group textarea {
  min-height: 80px;
  resize: vertical;
}

.slider-group {
  display: flex;
  align-items: center;
  gap: 15px;
}

.slider-group input[type="range"] {
  flex: 1;
}

.slider-value {
  font-weight: 600;
  color: #3498db;
  min-width: 50px;
}

.sample-count {
  color: #7f8c8d;
  font-size: 0.9em;
}

.allocations-editor {
  margin-top: 25px;
  padding-top: 20px;
  border-top: 2px solid #e0e0e0;
}

.allocations-editor h4 {
  margin: 0 0 15px 0;
  color: #2c3e50;
}

.allocation-row {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
  align-items: center;
}

.allocation-row select {
  flex: 2;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.percentage-input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
}

.percentage-input input {
  width: 80px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.allocation-summary {
  margin-top: 15px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 1.1em;
}

.allocation-summary .error {
  color: #e74c3c;
  margin-left: 10px;
}

.form-actions {
  margin-top: 25px;
  padding-top: 20px;
  border-top: 1px solid #e0e0e0;
  text-align: right;
}

.btn-primary {
  background: #3498db;
  color: white;
  border: none;
  padding: 12px 30px;
  border-radius: 4px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.3s;
}

.btn-primary:hover:not(:disabled) {
  background: #2980b9;
}

.btn-primary:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

.btn-add {
  background: #27ae60;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s;
}

.btn-add:hover {
  background: #229954;
}

.btn-remove {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s;
}

.btn-remove:hover {
  background: #c0392b;
}

.btn-delete {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.3s;
}

.btn-delete:hover {
  background: #c0392b;
}

/* Summary Cards */
.summary-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  margin-bottom: 20px;
}

.summary-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.summary-value {
  font-size: 2em;
  font-weight: bold;
  margin-bottom: 5px;
}

.summary-label {
  font-size: 0.9em;
  opacity: 0.9;
}

/* Distribution Chart */
.distribution-chart-container {
  margin: 20px 0;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.chart-wrapper {
  position: relative;
}

/* User Selection Section */
.user-selection-section {
  margin: 20px 0;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.user-search {
  margin-bottom: 15px;
}

.user-selection-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.user-checkbox-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 10px;
  background: white;
}

.user-checkbox-item {
  display: flex;
  align-items: center;
  padding: 10px;
  border-radius: 4px;
  margin-bottom: 5px;
  cursor: pointer;
  transition: background 0.2s;
}

.user-checkbox-item:hover {
  background: #f0f0f0;
}

.user-checkbox-item.selected {
  background: #e3f2fd;
}

.user-checkbox-item input[type="checkbox"] {
  margin-right: 10px;
}

.user-checkbox-item label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  flex: 1;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #3498db;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.2em;
}

.user-info {
  display: flex;
  flex-direction: column;
}

.user-info strong {
  display: block;
}

.user-info small {
  color: #7f8c8d;
}

.user-avatar-small {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #3498db;
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  margin-right: 10px;
}

/* Allocation Row Improvements */
.allocation-row {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  align-items: center;
  transition: all 0.3s;
}

.allocation-row.highlighted {
  background: #fff3cd;
  border: 2px solid #ffc107;
  animation: highlight 2s;
}

@keyframes highlight {
  0%, 100% { background: #fff3cd; }
  50% { background: #ffe69c; }
}

.user-info-display {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 150px;
}

.slider-container {
  flex: 2;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.slider-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.percentage-slider {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: #ddd;
  outline: none;
}

.percentage-slider::-webkit-slider-thumb {
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #3498db;
  cursor: pointer;
}

.percentage-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #3498db;
  cursor: pointer;
  border: none;
}

.btn-adjust {
  padding: 5px 10px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
  transition: all 0.2s;
}

.btn-adjust:hover {
  background: #f0f0f0;
  border-color: #3498db;
}

.percentage-display {
  display: flex;
  align-items: center;
  gap: 5px;
}

.percentage-input-number {
  width: 80px;
  padding: 5px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.bulk-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid #e0e0e0;
}

.btn-sm {
  padding: 6px 12px;
  font-size: 0.875rem;
  border-radius: 4px;
  border: 1px solid;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-sm.btn-outline-primary {
  background: white;
  color: #3498db;
  border-color: #3498db;
}

.btn-sm.btn-outline-primary:hover {
  background: #3498db;
  color: white;
}

.btn-sm.btn-outline-secondary {
  background: white;
  color: #6c757d;
  border-color: #6c757d;
}

.btn-sm.btn-outline-secondary:hover {
  background: #6c757d;
  color: white;
}

.btn-sm.btn-outline-success {
  background: white;
  color: #27ae60;
  border-color: #27ae60;
}

.btn-sm.btn-outline-success:hover {
  background: #27ae60;
  color: white;
}

.btn-sm.btn-primary {
  background: #3498db;
  color: white;
  border-color: #3498db;
}

.btn-sm.btn-primary:hover {
  background: #2980b9;
}

.allocation-summary .warning {
  color: #f39c12;
  margin-left: 10px;
}

.allocation-summary .success {
  color: #27ae60;
  margin-left: 10px;
}

/* Comments Section */
.comments-section {
  margin-top: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
}

.comments-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.btn-toggle-comments {
  padding: 6px 12px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-toggle-comments:hover {
  background: #2980b9;
}

.comment-stats {
  display: flex;
  gap: 20px;
  margin-bottom: 15px;
  padding: 10px;
  background: white;
  border-radius: 4px;
  font-size: 0.9em;
}

.comment-filters {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.form-select-sm, .form-control-sm {
  padding: 5px 10px;
  font-size: 0.875rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.comments-list {
  max-height: 400px;
  overflow-y: auto;
  background: white;
  border-radius: 4px;
  padding: 10px;
}

.comment-item {
  padding: 10px;
  margin-bottom: 10px;
  border-bottom: 1px solid #e0e0e0;
}

.comment-item:last-child {
  border-bottom: none;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
}

.comment-date {
  color: #7f8c8d;
  font-size: 0.85em;
}

.comment-text {
  color: #2c3e50;
  white-space: pre-wrap;
}

.no-comments {
  text-align: center;
  color: #7f8c8d;
  padding: 20px;
}
</style>
