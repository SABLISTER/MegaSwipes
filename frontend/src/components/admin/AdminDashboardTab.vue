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
        <div class="col-md-2">
          <div class="card text-center">
            <div class="card-body">
              <h3 class="card-title">{{ stats.totals?.users || 0 }}</h3>
              <p class="card-text text-muted">Users</p>
            </div>
          </div>
        </div>
        <div class="col-md-2">
          <div class="card text-center">
            <div class="card-body">
              <h3 class="card-title">{{ stats.totals?.studies || 0 }}</h3>
              <p class="card-text text-muted">Studies</p>
            </div>
          </div>
        </div>
        <div class="col-md-2">
          <div class="card text-center">
            <div class="card-body">
              <h3 class="card-title">{{ stats.totals?.datasets || 0 }}</h3>
              <p class="card-text text-muted">Datasets</p>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card text-center">
            <div class="card-body">
              <h3 class="card-title">{{ stats.totals?.samples || 0 }}</h3>
              <p class="card-text text-muted">Samples</p>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card text-center">
            <div class="card-body">
              <h3 class="card-title">{{ stats.totals?.votes || 0 }}</h3>
              <p class="card-text text-muted">Votes</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Activity & Top Contributors -->
      <div class="row">
        <div class="col-md-6">
          <div class="card">
            <div class="card-header">
              <h5 class="mb-0">Recent Activity</h5>
            </div>
            <div class="card-body">
              <div v-if="stats.recentActivity?.length === 0" class="text-muted">No recent activity</div>
              <div v-else class="list-group list-group-flush">
                <div v-for="activity in stats.recentActivity" :key="activity.id" class="list-group-item px-0">
                  <small class="text-muted">{{ formatDate(activity.created_at) }}</small><br>
                  <strong>{{ activity.username }}</strong> rated 
                  <span :class="activity.rating === 1 ? 'text-success' : 'text-danger'">
                    {{ activity.rating === 1 ? '✓' : '✗' }}
                  </span>
                  <em>{{ activity.filename }}</em> in {{ activity.dataset_name }}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card">
            <div class="card-header">
              <h5 class="mb-0">Top Contributors</h5>
            </div>
            <div class="card-body">
              <div v-if="stats.topContributors?.length === 0" class="text-muted">No contributors yet</div>
              <table v-else class="table table-sm">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Username</th>
                    <th>Score</th>
                    <th>Votes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(contributor, index) in stats.topContributors" :key="contributor.username">
                    <td>{{ index + 1 }}</td>
                    <td>{{ contributor.username }}</td>
                    <td>{{ contributor.total_score }}</td>
                    <td>{{ contributor.vote_count }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- Dataset Statistics -->
      <div class="row mt-4">
        <div class="col-12">
          <div class="card">
            <div class="card-header">
              <h5 class="mb-0">Dataset Statistics</h5>
            </div>
            <div class="card-body">
              <div v-if="stats.datasetStats?.length === 0" class="text-muted">No datasets yet</div>
              <table v-else class="table table-hover">
                <thead>
                  <tr>
                    <th>Dataset</th>
                    <th>Images</th>
                    <th>Subjects</th>
                    <th>Voted Samples</th>
                    <th>Total Votes</th>
                    <th>Avg Votes/Sample</th>
                    <th>Completion</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="ds in stats.datasetStats" :key="ds.id">
                    <td>{{ ds.name }}</td>
                    <td>{{ ds.total_samples }}</td>
                    <td>{{ ds.subject_count || 'N/A' }}</td>
                    <td>{{ ds.voted_samples }}</td>
                    <td>{{ ds.total_votes }}</td>
                    <td>{{ ds.avg_votes_per_sample?.toFixed(1) || 0 }}</td>
                    <td>
                      <div class="progress" style="height: 20px;">
                        <div 
                          class="progress-bar" 
                          :style="{ width: `${(ds.voted_samples / ds.total_samples * 100) || 0}%` }"
                        >
                          {{ ((ds.voted_samples / ds.total_samples * 100) || 0).toFixed(0) }}%
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { defineProps } from 'vue'
import { formatDate } from '../../composables/useAdmin.js'

const props = defineProps({
  stats: {
    type: Object,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
})
</script>

