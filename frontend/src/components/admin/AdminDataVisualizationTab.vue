<template>
  <div class="tab-pane">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h5 class="mb-0">Data Visualization</h5>
      <div class="d-flex gap-2">
        <button @click="loadStats" class="btn btn-sm btn-outline-primary" :disabled="loading">
          🔄 Refresh Data
        </button>
        <div class="btn-group" v-if="currentData && currentData.length > 0">
          <button 
            type="button"
            class="btn btn-sm btn-outline-success dropdown-toggle" 
            data-bs-toggle="dropdown"
            aria-expanded="false"
            title="Export current data"
          >
            📥 Export Data
          </button>
          <ul class="dropdown-menu">
            <li>
              <a class="dropdown-item" href="#" @click.prevent="exportToCSV(currentData, getExportFilename())">
                📊 Export as CSV
              </a>
            </li>
            <li>
              <a class="dropdown-item" href="#" @click.prevent="exportToJSON(currentData, getExportFilename())">
                📄 Export as JSON
              </a>
            </li>
            <li><hr class="dropdown-divider"></li>
            <li>
              <a class="dropdown-item" href="#" @click.prevent="exportAllStats()">
                📦 Export All Stats (JSON)
              </a>
            </li>
            <li><hr class="dropdown-divider"></li>
            <li>
              <a class="dropdown-item" href="#" @click.prevent="exportSamplesVotes()">
                📊 Export Samples & Votes (CSV)
              </a>
            </li>
            <li>
              <a class="dropdown-item" href="#" @click.prevent="exportSamplesVotes(null, true)">
                📊 Export All Samples & Votes (CSV)
              </a>
            </li>
          </ul>
        </div>
        <button 
          v-else
          class="btn btn-sm btn-outline-secondary" 
          disabled
          title="No data to export"
        >
          📥 Export Data
        </button>
      </div>
    </div>

    <div v-if="loading && !stats" class="text-center py-5">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else-if="stats">
      <!-- Chart Configuration -->
      <!-- Chart Configuration -->
      <!-- Chart Configuration -->
      <ChartConfigControls
        v-model:config="chartConfig"
        v-model:selectedStudyId="selectedStudyId"
        :studies="studies"
        :has-chart="!!chart || (chartConfig.type === 'heatmap' && !!chartCanvas)"
        :field-definitions="fieldDefinitions"
        @reset="resetConfig"
        @refresh="updateChart"
        @download="downloadChart"
      />

      <!-- Custom Data Input Section -->
      <CustomDataInput v-model="customDataEntries" />

      <!-- Upload QC Data Section -->
      <QcDataUpload @upload-success="handleQcUploadSuccess" />

      <!-- Chart Display -->
      <div class="card">
        <div class="card-body">
          <div v-if="!chartData && chartConfig.type !== 'heatmap'" class="text-center text-muted py-5">
            <div v-if="loading">
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <p class="mt-2">Loading data...</p>
            </div>
            <div v-else-if="currentData.length === 0 && stats">
              <p class="lead">No data available for this configuration.</p>
              <p class="small" v-if="chartConfig.dataSource === 'interRaterAgreement'">
                Note: Inter-rater agreement requires at least 2 admin users to have voted on the same images.
              </p>
              <p class="small" v-else>
                Try selecting a different data source, study filter, or chart type.
              </p>
            </div>
            <div v-else>
              <p>Configure your chart above and click "Update Chart" to visualize the data.</p>
            </div>
          </div>
          <div v-else>
            <canvas 
              ref="chartCanvas" 
              :style="{ width: chartConfig.type === 'heatmap' ? '100%' : 'auto', height: chartConfig.type === 'heatmap' ? '600px' : 'auto' }"
            ></canvas>
          </div>
        </div>
      </div>

      <!-- Data Table -->
      <StatsDataTable 
        :data="currentData" 
        :data-source="chartConfig.dataSource"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Chart, registerables } from 'chart.js'
import api from '../../lib/api.js'
import QcDataUpload from './dataviz/QcDataUpload.vue'
import ChartConfigControls from './dataviz/ChartConfigControls.vue'
import CustomDataInput from './dataviz/CustomDataInput.vue'
import StatsDataTable from './dataviz/StatsDataTable.vue'


Chart.register(...registerables)

const props = defineProps({
  loading: {
    type: Boolean,
    default: false
  }
})

const stats = ref(null)
const advancedStats = ref(null)
const loading = ref(false)
const chart = ref(null)
const chartCanvas = ref(null)
const chartData = ref(null)
const currentData = ref([])
const showCustomData = ref(false)
const customDataEntries = ref([])
const studies = ref([])
const selectedStudyId = ref('')


const chartConfig = ref({
  type: 'bar',
  dataSource: 'perStudy',
  xAxis: 'name',
  yAxis: 'total_votes',
  labelField: 'name',
  valueField: 'total_votes',
  heatmapColumn: '',
  limit: 50
})



function resetConfig() {
  chartConfig.value = {
    type: 'bar',
    dataSource: 'perStudy',
    xAxis: 'name',
    yAxis: 'total_votes',
    labelField: 'name',
    valueField: 'total_votes',
    heatmapColumn: '',
    limit: 50
  }
  selectedStudyId.value = ''
  onDataSourceChange();
}

// Field definitions for each data source
const fieldDefinitions = {
  perStudy: {
    x: [
      { value: 'name', label: 'Study Name' },
      { value: 'id', label: 'Study ID' }
    ],
    y: [
      { value: 'total_votes', label: 'Total Votes' },
      { value: 'pass_count', label: 'Pass Count' },
      { value: 'fail_count', label: 'Fail Count' },
      { value: 'pass_percentage', label: 'Pass Percentage' },
      { value: 'fail_percentage', label: 'Fail Percentage' },
      { value: 'unique_voters', label: 'Unique Voters' },
      { value: 'dataset_count', label: 'Dataset Count' },
      { value: 'total_images', label: 'Total Images' },
      { value: 'subject_count', label: 'Subject Count' },
      { value: 'samples_voted', label: 'Samples Voted' }
    ]
  },
  perDataset: {
    x: [
      { value: 'name', label: 'Dataset Name' },
      { value: 'study_name', label: 'Study Name' },
      { value: 'site', label: 'Site' },
      { value: 'id', label: 'Dataset ID' }
    ],
    y: [
      { value: 'total_votes', label: 'Total Votes' },
      { value: 'pass_count', label: 'Pass Count' },
      { value: 'fail_count', label: 'Fail Count' },
      { value: 'pass_percentage', label: 'Pass Percentage' },
      { value: 'fail_percentage', label: 'Fail Percentage' },
      { value: 'completion_percentage', label: 'Completion %' },
      { value: 'unique_voters', label: 'Unique Voters' },
      { value: 'total_samples', label: 'Total Samples' },
      { value: 'subject_count', label: 'Subject Count' },
      { value: 'samples_voted', label: 'Samples Voted' },
      { value: 'average_rating', label: 'Average Rating' }
    ]
  },
  perImage: {
    x: [
      { value: 'filename', label: 'Filename' },
      { value: 'dataset_name', label: 'Dataset Name' },
      { value: 'study_name', label: 'Study Name' },
      { value: 'site', label: 'Site' },
      { value: 'id', label: 'Image ID' }
    ],
    y: [
      { value: 'vote_count', label: 'Vote Count' },
      { value: 'pass_count', label: 'Pass Count' },
      { value: 'fail_count', label: 'Fail Count' },
      { value: 'pass_percentage', label: 'Pass Percentage' },
      { value: 'fail_percentage', label: 'Fail Percentage' },
      { value: 'average_rating', label: 'Average Rating' },
      { value: 'unique_voters', label: 'Unique Voters' }
    ]
  },
  overall: {
    x: [],
    y: [
      { value: 'total_votes', label: 'Total Votes' },
      { value: 'pass_count', label: 'Pass Count' },
      { value: 'fail_count', label: 'Fail Count' },
      { value: 'pass_percentage', label: 'Pass Percentage' },
      { value: 'fail_percentage', label: 'Fail Percentage' },
      { value: 'unique_voters', label: 'Unique Voters' },
      { value: 'unique_samples_voted', label: 'Unique Samples Voted' },
      { value: 'unique_datasets_voted', label: 'Unique Datasets Voted' }
    ]
  },
  perRater: {
    x: [
      { value: 'username', label: 'Rater/Username' },
      { value: 'id', label: 'User ID' }
    ],
    y: [
      { value: 'total_votes', label: 'Total Votes' },
      { value: 'pass_count', label: 'Pass Count' },
      { value: 'fail_count', label: 'Fail Count' },
      { value: 'pass_percentage', label: 'Pass Percentage' },
      { value: 'fail_percentage', label: 'Fail Percentage' },
      { value: 'unique_samples_voted', label: 'Unique Samples Voted' },
      { value: 'unique_datasets_voted', label: 'Unique Datasets Voted' },
      { value: 'unique_studies_voted', label: 'Unique Studies Voted' },
      { value: 'average_rating', label: 'Average Rating' },
      { value: 'total_score', label: 'Total Score' }
    ]
  },
  sites: {
    x: [
      { value: 'site', label: 'Site Name' },
      { value: 'id', label: 'Site ID' }
    ],
    y: [
      { value: 'mean', label: 'Mean Euler Number' },
      { value: 'std', label: 'Std Dev' },
      { value: 'q1', label: 'Q1' },
      { value: 'median', label: 'Median' },
      { value: 'q3', label: 'Q3' },
      { value: 'min', label: 'Min' },
      { value: 'max', label: 'Max' },
      { value: 'count', label: 'Sample Count' }
    ]
  },
  scanPassRates: {
    x: [
      { value: 'pass_rate', label: 'Pass Rate' },
      { value: 'subject_id', label: 'Subject ID' }
    ],
    y: [
      { value: 'pass_rate', label: 'Pass Rate' },
      { value: 'total_votes', label: 'Total Votes' },
      { value: 'good_votes', label: 'Good Votes' },
      { value: 'image_count', label: 'Image Count' }
    ]
  },
  imagePassRates: {
    x: [
      { value: 'image_position', label: 'Image Position' },
      { value: 'dataset_name', label: 'Dataset Name' }
    ],
    y: [
      { value: 'pass_rate', label: 'Pass Rate' },
      { value: 'total_votes', label: 'Total Votes' },
      { value: 'good_votes', label: 'Good Votes' }
    ]
  },
  raterBehavior: {
    x: [
      { value: 'username', label: 'Rater Username' },
      { value: 'id', label: 'User ID' }
    ],
    y: [
      { value: 'pass_rate', label: 'Pass Rate (%)' },
      { value: 'total_votes', label: 'Total Votes' },
      { value: 'good_votes', label: 'Good Votes' }
    ]
  },
  interRaterAgreement: {
    x: [
      { value: 'fraction_good', label: 'Fraction Good' },
      { value: 'subject_id', label: 'Subject ID' }
    ],
    y: [
      { value: 'agreement', label: 'Agreement' },
      { value: 'fraction_good', label: 'Fraction Good' },
      { value: 'power_user_count', label: 'Power User Count' }
    ]
  },
  timePatterns: {
    x: [
      { value: 'vote_date', label: 'Date' }
    ],
    y: [
      { value: 'pass_rate', label: 'Pass Rate (%)' },
      { value: 'total_votes', label: 'Total Votes' },
      { value: 'good_votes', label: 'Good Votes' }
    ]
  },
  fatigue: {
    x: [
      { value: 'vote_index', label: 'Vote Index in Session' },
      { value: 'session_date', label: 'Session Date' }
    ],
    y: [
      { value: 'cumulative_pass_rate', label: 'Cumulative Pass Rate' },
      { value: 'rating', label: 'Rating' }
    ]
  },
  imageEntropy: {
    x: [
      { value: 'entropy', label: 'Entropy' },
      { value: 'filename', label: 'Filename' }
    ],
    y: [
      { value: 'entropy', label: 'Entropy' },
      { value: 'pass_rate', label: 'Pass Rate' },
      { value: 'total_votes', label: 'Total Votes' }
    ]
  },
  calibration: {
    x: [
      { value: 'power_pass_rate', label: 'Power User Pass Rate' }
    ],
    y: [
      { value: 'regular_pass_rate', label: 'Regular User Pass Rate' },
      { value: 'power_pass_rate', label: 'Power User Pass Rate' }
    ]
  }
}

const availableXFields = computed(() => {
  return fieldDefinitions[chartConfig.value.dataSource]?.x || []
})

const availableYFields = computed(() => {
  return fieldDefinitions[chartConfig.value.dataSource]?.y || []
})

const availableLabelFields = computed(() => {
  return fieldDefinitions[chartConfig.value.dataSource]?.x || []
})

const tableFields = computed(() => {
  if (currentData.value.length === 0) return []
  const fields = Object.keys(currentData.value[0])
  return fields.filter(f => f !== 'id' || chartConfig.value.dataSource === 'overall')
})

// Define advanced data sources once at the top level
const advancedDataSources = ['scanPassRates', 'imagePassRates', 'raterBehavior', 'interRaterAgreement', 'timePatterns', 'fatigue', 'imageEntropy', 'calibration', 'sitePassRates', 'eulerVsPassRate']

function onDataSourceChange() {
  // Reset to first available field when data source changes
  const fields = fieldDefinitions[chartConfig.value.dataSource]
  if (fields?.x.length > 0) {
    chartConfig.value.xAxis = fields.x[0].value
    // Also set default heatmap column if available (use second field if possible)
    if (fields.x.length > 1) {
      chartConfig.value.heatmapColumn = fields.x[1].value
    } else {
      chartConfig.value.heatmapColumn = ''
    }
  }
  if (fields?.y.length > 0) {
    chartConfig.value.yAxis = fields.y[0].value
    chartConfig.value.valueField = fields.y[0].value
  }
  if (fields?.x.length > 0) {
    chartConfig.value.labelField = fields.x[0].value
  }
  
  // Auto-set to box plot for sites (but allow manual selection for others)
  if (chartConfig.value.dataSource === 'sites') {
    chartConfig.value.type = 'box'
  } else if (chartConfig.value.type === 'box' && chartConfig.value.dataSource !== 'sites') {
    // Reset from box if switching away from sites
    chartConfig.value.type = 'bar'
  }
  
  // Reset study filter when switching to data sources that don't support it
  if (!['perDataset', 'perImage', 'perStudy'].includes(chartConfig.value.dataSource)) {
    selectedStudyId.value = ''
  }
  
  // Auto-set chart type for certain data sources
  if (chartConfig.value.dataSource === 'scanPassRates') {
    chartConfig.value.type = 'bar' // Histogram
  } else if (chartConfig.value.dataSource === 'calibration' || chartConfig.value.dataSource === 'imageEntropy' || chartConfig.value.dataSource === 'eulerVsPassRate') {
    chartConfig.value.type = 'scatter'
  } else if (chartConfig.value.dataSource === 'timePatterns' || chartConfig.value.dataSource === 'fatigue') {
    chartConfig.value.type = 'line'
  } else if (chartConfig.value.dataSource === 'imagePassRates' || chartConfig.value.dataSource === 'raterBehavior' || chartConfig.value.dataSource === 'sitePassRates') {
    chartConfig.value.type = 'bar'
  }
  
  // Load perRater data if needed
  if (chartConfig.value.dataSource === 'perRater' && (!stats.value || !stats.value.perRater)) {
    loadStats();
  }
  
  // Load sites data if needed
  if (chartConfig.value.dataSource === 'sites' && (!stats.value || !stats.value.sites)) {
    loadStats();
  }
  
  // Load advanced stats if needed
  if (advancedDataSources.includes(chartConfig.value.dataSource) && !advancedStats.value) {
    loadAdvancedStats();
  } else {
    updateChart();
  }
}

function onStudyFilterChange() {
  // Update chart when study filter changes
  updateChart();
}

// Helper function to extract site from dataset name
function extractSiteFromDatasetName(datasetName) {
  if (!datasetName) return 'Unknown'
  // Pattern: HBN_XXX -> site is XXX
  const hbnMatch = datasetName.match(/^HBN_(.+)$/)
  if (hbnMatch) {
    return hbnMatch[1]
  }
  // For other datasets, use dataset name as site or return 'default'
  if (datasetName.includes('_')) {
    const site = datasetName.split('_').pop()
    if (site) {
      return site
    } else {
      return datasetName
    }
  } else {
    return datasetName
  }
  return 'default'
}

function getCurrentData() {
  // Check if we need advanced stats
  if (advancedDataSources.includes(chartConfig.value.dataSource)) {
    if (!advancedStats.value) return []
    
    switch (chartConfig.value.dataSource) {
      case 'scanPassRates':
        return advancedStats.value.scanPassRates || []
      case 'imagePassRates':
        return advancedStats.value.imagePassRates || []
      case 'raterBehavior':
        return advancedStats.value.raterStats || []
      case 'interRaterAgreement':
        return advancedStats.value.interRaterAgreement || []
      case 'timePatterns':
        return advancedStats.value.timeStats || []
      case 'fatigue':
        return advancedStats.value.fatigueStats || []
      case 'imageEntropy':
        return advancedStats.value.imageEntropy || []
      case 'calibration':
        return advancedStats.value.calibrationData || []
      case 'sitePassRates':
        return advancedStats.value.sitePassRates || []
      case 'eulerVsPassRate':
        return advancedStats.value.eulerVsPassRate || []
      default:
        return []
    }
  }
  
  if (!stats.value && chartConfig.value.dataSource !== 'sites') return []
  
  let data = []
  switch (chartConfig.value.dataSource) {
    case 'perStudy':
      data = stats.value.perStudy || []
      // If a study is selected, filter to only that study
      if (selectedStudyId.value) {
        data = data.filter(item => item.id === parseInt(selectedStudyId.value))
      }
      break
    case 'perDataset':
      data = (stats.value.perDataset || []).map(item => ({
        ...item,
        site: extractSiteFromDatasetName(item.name)
      }))
      // Filter by selected study if one is chosen
      if (selectedStudyId.value) {
        data = data.filter(item => item.study_id === parseInt(selectedStudyId.value))
      }
      break
    case 'perImage':
      data = (stats.value.perImage || []).slice(0, chartConfig.value.limit).map(item => ({
        ...item,
        site: extractSiteFromDatasetName(item.dataset_name)
      }))
      // Filter by selected study if one is chosen
      if (selectedStudyId.value) {
        data = data.filter(item => item.study_id === parseInt(selectedStudyId.value))
      }
      break
    case 'perRater':
      data = stats.value.perRater || []
      break
    case 'overall':
      data = [stats.value.overall]
      break
    case 'sites':
      data = stats.value.sites || []
      break
  }
  
  // Apply sorting if needed
  if (chartConfig.value.dataSource === 'sitePassRates') {
    data.sort((a, b) => a.pass_rate - b.pass_rate)
  }

  return data
}




function updateChart() {
  if (!stats.value && chartConfig.value.dataSource !== 'sites') {
    // Allow custom data only
    if (chartConfig.value.dataSource === 'sites' && customDataEntries.value.length > 0) {
      const customData = customDataEntries.value.map(entry => ({
        site: entry.siteName || 'Custom',
        mean: entry.average,
        std: entry.stdDev,
        q1: entry.q1,
        median: entry.median,
        q3: entry.q3,
        min: entry.min,
        max: entry.max,
        count: 0,
        isCustom: true
      }))
      currentData.value = customData;
      if (chartConfig.value.type === 'box') {
        renderBoxPlot(customData);
      }
      return;
    }
    return
  }
  
  const data = getCurrentData();
  
  // Merge custom data if available and data source is sites
  if (chartConfig.value.dataSource === 'sites' && customDataEntries.value.length > 0) {
    const customData = customDataEntries.value.map(entry => ({
      site: entry.siteName || 'Custom',
      mean: entry.average,
      std: entry.stdDev,
      q1: entry.q1,
      median: entry.median,
      q3: entry.q3,
      min: entry.min,
      max: entry.max,
      count: 0,
      isCustom: true
    }));
    console.log(customData);
    currentData.value = [...data, ...customData];
  } else {
    currentData.value = data;
  }
  
  if (currentData.value.length === 0) {
    chartData.value = null
    destroyChart();
    return
  }

  // Handle overall data source specially
  if (chartConfig.value.dataSource === 'overall') {
    const overallData = stats.value.overall;
    const selectedField = chartConfig.value.yAxis || 'total_votes'
    const value = parseFloat(overallData[selectedField] || 0);
    const label = fieldDefinitions.overall.y.find(f => f.value === selectedField)?.label || 'Value';
    
    chartData.value = {
      labels: [label],
      datasets: [{
        label: label,
        data: [value],
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    }
    
    // Force bar chart for overall
    const originalType = chartConfig.value.type
    chartConfig.value.type = 'bar'
    
    nextTick(() => {
      renderChart();
      chartConfig.value.type = originalType
    })
    return
  }

  // Handle box plot specially - calculate quartiles from any numeric data
  if (chartConfig.value.type === 'box') {
    renderBoxPlot(currentData.value);
    return
  }

  const isPieChart = chartConfig.value.type === 'pie' || chartConfig.value.type === 'doughnut'
  
  if (isPieChart) {
    const labels = currentData.value.map(item => {
      const value = item[chartConfig.value.labelField]
      if (typeof value === 'string' && value.length > 30) {
        return value.substring(0, 27) + '...'
      }
      return value || 'Unknown'
    })
    const values = currentData.value.map(item => parseFloat(item[chartConfig.value.valueField] || 0))
    
    chartData.value = {
      labels,
      datasets: [{
        label: fieldDefinitions[chartConfig.value.dataSource]?.y.find(f => f.value === chartConfig.value.valueField)?.label || 'Value',
        data: values,
        backgroundColor: generateColors(values.length)
      }]
    }
  } else if (chartConfig.value.type === 'scatter' || chartConfig.value.dataSource === 'calibration') {
    // Special handling for calibration plot
    if (chartConfig.value.dataSource === 'calibration') {
      const powerRates = currentData.value.map(item => parseFloat(item.power_pass_rate || 0))
      const regularRates = currentData.value.map(item => parseFloat(item.regular_pass_rate || 0))
      
      chartData.value = {
        datasets: [{
          label: 'Power vs Regular Users',
          data: powerRates.map((x, i) => ({ x, y: regularRates[i] })),
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          pointRadius: 4
        }, {
          // Diagonal reference line (y = x)
          label: 'Perfect Alignment',
          data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
          type: 'line',
          borderColor: 'rgba(255, 99, 132, 0.8)',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
        }]
      }
    } else {
      // For scatter plots, we need numeric X and Y values
      const xValues = currentData.value.map(item => {
        const value = item[chartConfig.value.xAxis]
        if (typeof value === 'number') return value
        if (typeof value === 'string') {
          // Try to parse as number
          const parsed = parseFloat(value)
          if (!isNaN(parsed)) return parsed
          // Otherwise use index
          return currentData.value.indexOf(item)
        }
        return currentData.value.indexOf(item)
      })
      const yValues = currentData.value.map(item => parseFloat(item[chartConfig.value.yAxis] || 0))

      chartData.value = {
        datasets: [{
          label: fieldDefinitions[chartConfig.value.dataSource]?.y.find(f => f.value === chartConfig.value.yAxis)?.label || 'Value',
          data: xValues.map((x, i) => ({ x, y: yValues[i] })),
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
          borderColor: 'rgba(54, 162, 235, 1)',
          pointRadius: 5
        }]
      }
    }
  } else if (chartConfig.value.dataSource === 'scanPassRates' && chartConfig.value.type === 'bar') {
    // Histogram for scan pass rates
    const bins = 20
    const passRates = currentData.value.map(item => parseFloat(item.pass_rate || 0))
    const min = Math.min(...passRates)
    const max = Math.max(...passRates)
    const binWidth = (max - min) / bins
    
    const histogram = new Array(bins).fill(0)
    const binLabels = []
    
    for (let i = 0; i < bins; i++) {
      const binStart = min + i * binWidth
      const binEnd = binStart + binWidth
      binLabels.push(`${(binStart * 100).toFixed(0)}-${(binEnd * 100).toFixed(0)}%`)
      
      passRates.forEach(rate => {
        if (rate >= binStart && (i === bins - 1 ? rate <= binEnd : rate < binEnd)) {
          histogram[i]++
        }
      })
    }
    
    chartData.value = {
      labels: binLabels,
      datasets: [{
        label: 'Number of Scans',
        data: histogram,
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    }
  } else if (chartConfig.value.dataSource === 'raterBehavior') {
    // Color code by power user status
    const powerUsers = currentData.value.filter(item => item.is_admin === 1)
    const regularUsers = currentData.value.filter(item => item.is_admin !== 1)
    
    const datasets = []
    
    if (powerUsers.length > 0) {
      datasets.push({
        label: 'Power Users',
        data: powerUsers.map(item => parseFloat(item[chartConfig.value.yAxis] || 0)),
        backgroundColor: 'rgba(255, 99, 132, 0.6)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1
      })
    }
    
    if (regularUsers.length > 0) {
      datasets.push({
        label: 'Regular Users',
        data: regularUsers.map(item => parseFloat(item[chartConfig.value.yAxis] || 0)),
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      })
    }
    
    const labels = currentData.value.map(item => item[chartConfig.value.xAxis] || 'Unknown')
    
    chartData.value = {
      labels,
      datasets
    }
  } else {
    const labels = currentData.value.map(item => {
      const value = item[chartConfig.value.xAxis]
      // Truncate long labels
      if (typeof value === 'string' && value.length > 20) {
        return value.substring(0, 17) + '...'
      }
      return value || 'Unknown'
    })
    const values = currentData.value.map(item => parseFloat(item[chartConfig.value.yAxis] || 0))
    
    chartData.value = {
      labels,
      datasets: [{
        label: fieldDefinitions[chartConfig.value.dataSource]?.y.find(f => f.value === chartConfig.value.yAxis)?.label || 'Value',
        data: values,
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    }
  }

  nextTick(() => {
    if (chartConfig.value.type === 'heatmap') {
      renderHeatmap(currentData.value);
    } else {
      renderChart();
    }
  })
}

function handleQcUploadSuccess() {
  loadAdvancedStats();
  if (chartConfig.value.dataSource === 'sites' || chartConfig.value.dataSource === 'eulerVsPassRate') {
    setTimeout(() => {
      updateChart();
    }, 500)
  }
}

// Helper function to calculate percentile with interpolation
function calculatePercentile(arr, percentile) {
  if (arr.length === 0) return null
  if (arr.length === 1) return arr[0]
  
  const sorted = [...arr].sort((a, b) => a - b)
  const index = (percentile / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower
  
  if (lower === upper) {
    return sorted[lower]
  }
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function renderBoxPlot(data) {
  if (!chartCanvas.value) {
    console.warn('Cannot render box plot: no canvas')
    return
  }
  
  if (!data || data.length === 0) {
    // Render "No Data" message
    const ctx = chartCanvas.value.getContext('2d')
    ctx.clearRect(0, 0, chartCanvas.value.width, chartCanvas.value.height)
    ctx.font = '16px Arial'
    ctx.fillStyle = '#666'
    ctx.textAlign = 'center'
    ctx.fillText('No data available for box plot', chartCanvas.value.width / 2, chartCanvas.value.height / 2)
    return
  }
  
  destroyChart()
  
  // Determine what field to use for grouping and what field for values
  let groupField = 'site'
  let valueField = null
  
  // For sites data source, use pre-calculated quartiles if available
  if (chartConfig.value.dataSource === 'sites') {
    groupField = 'site'
    valueField = null // Use pre-calculated quartiles
  } else {
    // For other data sources, group by X-axis and calculate quartiles from Y-axis values
    groupField = chartConfig.value.xAxis || 'name'
    valueField = chartConfig.value.yAxis
  }
  
  // Prepare box plot data
  const datasets = []
  
  // Real data
  const realData = data.filter(d => !d.isCustom)
  
  if (realData.length > 0) {
    if (chartConfig.value.dataSource === 'sites' && realData.some(d => d.q1 !== null && d.q1 !== undefined)) {
      // Use pre-calculated quartiles from sites data
      const validData = realData.filter(d => 
        (d.q1 !== null && d.q1 !== undefined) || 
        (d.median !== null && d.median !== undefined) || 
        (d.q3 !== null && d.q3 !== undefined)
      )
      
      if (validData.length > 0) {
        datasets.push({
          label: 'Real Data',
          data: validData.map(d => {
            const q1 = d.q1 !== null && d.q1 !== undefined ? d.q1 : null
            const median = d.median !== null && d.median !== undefined ? d.median : (d.mean !== null && d.mean !== undefined ? d.mean : null)
            const q3 = d.q3 !== null && d.q3 !== undefined ? d.q3 : null
            const iqr = d.iqr !== null && d.iqr !== undefined ? d.iqr : (q3 !== null && q1 !== null ? q3 - q1 : null)
            
            let lowerWhisker = d.lowerWhisker
            let upperWhisker = d.upperWhisker
            
            if (lowerWhisker === null || lowerWhisker === undefined) {
              if (q1 !== null && iqr !== null && d.min !== null && d.min !== undefined) {
                lowerWhisker = Math.max(d.min, q1 - 1.5 * iqr)
              } else if (d.min !== null && d.min !== undefined) {
                lowerWhisker = d.min
              } else {
                lowerWhisker = q1
              }
            }
            
            if (upperWhisker === null || upperWhisker === undefined) {
              if (q3 !== null && iqr !== null && d.max !== null && d.max !== undefined) {
                upperWhisker = Math.min(d.max, q3 + 1.5 * iqr)
              } else if (d.max !== null && d.max !== undefined) {
                upperWhisker = d.max
              } else {
                upperWhisker = q3
              }
            }
            
            return {
              min: d.min !== null && d.min !== undefined ? d.min : null,
              q1: q1,
              median: median,
              q3: q3,
              max: d.max !== null && d.max !== undefined ? d.max : null,
              iqr: iqr,
              lowerWhisker: lowerWhisker,
              upperWhisker: upperWhisker,
              outliers: d.outliers || []
            }
          }),
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 2
        })
      }
    } else if (valueField) {
      // For aggregated data sources (perStudy, perDataset, perRater), each row is already aggregated
      // So we collect all Y-axis values and create a single box plot showing the distribution
      // For non-aggregated sources (perImage), we can group by X-axis
      const isAggregatedSource = ['perStudy', 'perDataset', 'perRater'].includes(chartConfig.value.dataSource)
      
      if (isAggregatedSource) {
        // Collect all Y-axis values to show distribution across all items
        const allValues = []
        const labels = []
        
        realData.forEach(d => {
          const value = parseFloat(d[valueField])
          if (!isNaN(value)) {
            allValues.push(value)
            labels.push(String(d[groupField] || 'Unknown'))
          }
        })
        
        if (allValues.length > 0) {
          const sorted = [...allValues].sort((a, b) => a - b)
          const q1 = calculatePercentile(sorted, 25)
          const median = calculatePercentile(sorted, 50)
          const q3 = calculatePercentile(sorted, 75)
          const iqr = q3 - q1
          const min = sorted[0]
          const max = sorted[sorted.length - 1]
          
          const lowerWhisker = Math.max(min, q1 - 1.5 * iqr)
          const upperWhisker = Math.min(max, q3 + 1.5 * iqr)
          const outliers = sorted.filter(v => v < lowerWhisker || v > upperWhisker)
          
          datasets.push({
            label: fieldDefinitions[chartConfig.value.dataSource]?.y.find(f => f.value === valueField)?.label || 'Value',
            data: [{
              groupKey: 'All ' + (chartConfig.value.dataSource === 'perStudy' ? 'Studies' : chartConfig.value.dataSource === 'perDataset' ? 'Datasets' : 'Raters'),
              min,
              q1,
              median,
              q3,
              max,
              iqr,
              lowerWhisker,
              upperWhisker,
              outliers
            }],
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 2
          })
        }
      } else {
        // For non-aggregated sources (like perImage), group by X-axis and calculate quartiles per group
        const valuesByGroup = {}
        
        realData.forEach(d => {
          const groupKey = String(d[groupField] || 'Unknown')
          const value = parseFloat(d[valueField])
          
          if (!isNaN(value)) {
            if (!valuesByGroup[groupKey]) {
              valuesByGroup[groupKey] = []
            }
            valuesByGroup[groupKey].push(value)
          }
        })
        
        // Calculate quartiles for each group (only if group has multiple values)
        const boxPlotData = Object.entries(valuesByGroup)
          .filter(([_, values]) => values.length > 1) // Only groups with multiple values
          .map(([groupKey, values]) => {
            const sorted = [...values].sort((a, b) => a - b)
            const q1 = calculatePercentile(sorted, 25)
            const median = calculatePercentile(sorted, 50)
            const q3 = calculatePercentile(sorted, 75)
            const iqr = q3 - q1
            const min = sorted[0]
            const max = sorted[sorted.length - 1]
            
            const lowerWhisker = Math.max(min, q1 - 1.5 * iqr)
            const upperWhisker = Math.min(max, q3 + 1.5 * iqr)
            const outliers = sorted.filter(v => v < lowerWhisker || v > upperWhisker)
            
            return {
              groupKey,
              min,
              q1,
              median,
              q3,
              max,
              iqr,
              lowerWhisker,
              upperWhisker,
              outliers
            }
          })
        
        if (boxPlotData.length > 0) {
          datasets.push({
            label: fieldDefinitions[chartConfig.value.dataSource]?.y.find(f => f.value === valueField)?.label || 'Value',
            data: boxPlotData,
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 2
          })
        }
      }
    }
  }
  
  // Custom data (only for sites data source with manual entry)
  const customData = data.filter(d => d.isCustom && (
    (d.q1 !== null && d.q1 !== undefined) || 
    (d.median !== null && d.median !== undefined) || 
    (d.q3 !== null && d.q3 !== undefined)
  ))
  
  if (customData.length > 0) {
    datasets.push({
      label: 'Custom Data',
      data: customData.map(d => {
        const q1 = d.q1 !== null && d.q1 !== undefined ? d.q1 : null
        const median = d.median !== null && d.median !== undefined ? d.median : (d.average !== null && d.average !== undefined ? d.average : null)
        const q3 = d.q3 !== null && d.q3 !== undefined ? d.q3 : null
        const iqr = d.iqr !== null && d.iqr !== undefined ? d.iqr : (q3 !== null && q1 !== null ? q3 - q1 : null)
        
        let lowerWhisker = d.lowerWhisker
        let upperWhisker = d.upperWhisker
        
        if (lowerWhisker === null || lowerWhisker === undefined) {
          if (q1 !== null && iqr !== null && d.min !== null && d.min !== undefined) {
            lowerWhisker = Math.max(d.min, q1 - 1.5 * iqr)
          } else if (d.min !== null && d.min !== undefined) {
            lowerWhisker = d.min
          } else {
            lowerWhisker = q1
          }
        }
        
        if (upperWhisker === null || upperWhisker === undefined) {
          if (q3 !== null && iqr !== null && d.max !== null && d.max !== undefined) {
            upperWhisker = Math.min(d.max, q3 + 1.5 * iqr)
          } else if (d.max !== null && d.max !== undefined) {
            upperWhisker = d.max
          } else {
            upperWhisker = q3
          }
        }
        
        return {
          min: d.min !== null && d.min !== undefined ? d.min : null,
          q1: q1,
          median: median,
          q3: q3,
          max: d.max !== null && d.max !== undefined ? d.max : null,
          iqr: iqr,
          lowerWhisker: lowerWhisker,
          upperWhisker: upperWhisker,
          outliers: d.outliers || []
        }
      }),
      backgroundColor: 'rgba(255, 99, 132, 0.5)',
      borderColor: 'rgba(255, 99, 132, 1)',
      borderWidth: 2
    })
  }
  
  // If no valid datasets, don't render
  if (datasets.length === 0) {
    console.warn('Cannot render box plot: no valid numeric data to calculate quartiles')
    chartData.value = null
    destroyChart();
    return
  }
  
  // Get labels from the data
  let labels = []
  if (chartConfig.value.dataSource === 'sites') {
    labels = datasets[0].data.map(d => d.site || d.name || 'Unknown')
  } else {
    labels = datasets[0].data.map(d => d.groupKey || 'Unknown')
  }
  
  // Use a bar chart with custom rendering for box plots
  // For now, we'll use a simplified approach with error bars
  const ctx = chartCanvas.value.getContext('2d')
  
  // Create a custom box plot using bar chart as base
  const boxPlotData = {
    labels: labels,
    datasets: datasets.map((ds, idx) => ({
      label: ds.label,
      data: ds.data.map(box => box.median),
      backgroundColor: ds.backgroundColor,
      borderColor: ds.borderColor,
      borderWidth: ds.borderWidth,
      // Store box plot data for custom rendering
      boxData: ds.data
    }))
  }
  
  chart.value = new Chart(ctx, {
    type: 'bar',
    data: boxPlotData,
    options: {
      indexAxis: 'y', // Horizontal
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        title: {
          display: true,
          text: chartConfig.value.dataSource === 'sites' 
            ? 'Euler Numbers by Site - Box Plot'
            : `${fieldDefinitions[chartConfig.value.dataSource]?.y.find(f => f.value === valueField)?.label || 'Value'} by ${fieldDefinitions[chartConfig.value.dataSource]?.x.find(f => f.value === groupField)?.label || 'Category'} - Box Plot`
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const dataset = context.dataset
              const boxData = dataset.boxData[context.dataIndex]
              if (boxData) {
                const tooltip = [
                  `Q1: ${formatValue(boxData.q1)}`,
                  `Median: ${formatValue(boxData.median)}`,
                  `Q3: ${formatValue(boxData.q3)}`
                ]
                
                if (boxData.iqr !== null && boxData.iqr !== undefined) {
                  tooltip.push(`IQR: ${formatValue(boxData.iqr)}`)
                }
                
                if (boxData.lowerWhisker !== null && boxData.lowerWhisker !== undefined) {
                  tooltip.push(`Lower Whisker: ${formatValue(boxData.lowerWhisker)}`)
                }
                if (boxData.upperWhisker !== null && boxData.upperWhisker !== undefined) {
                  tooltip.push(`Upper Whisker: ${formatValue(boxData.upperWhisker)}`)
                }
                
                if (boxData.min !== null && boxData.min !== undefined) {
                  tooltip.push(`Min: ${formatValue(boxData.min)}`)
                }
                if (boxData.max !== null && boxData.max !== undefined) {
                  tooltip.push(`Max: ${formatValue(boxData.max)}`)
                }
                
                if (boxData.outliers && boxData.outliers.length > 0) {
                  tooltip.push(`Outliers: ${boxData.outliers.length} (${boxData.outliers.slice(0, 3).map(v => formatValue(v)).join(', ')}${boxData.outliers.length > 3 ? '...' : ''})`)
                }
                
                return tooltip
              }
              return `${dataset.label}: ${formatValue(context.parsed.x)}`
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Euler Number'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Site'
          }
        }
      },
      // Custom plugin to draw box plots
      plugins: [{
        id: 'boxPlot',
        afterDatasetsDraw: (chart) => {
          const ctx = chart.ctx
          const meta = chart.getDatasetMeta(0)
          
          chart.data.datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex)
            const boxData = dataset.boxData
            
            meta.data.forEach((bar, index) => {
              if (!boxData || !boxData[index]) return
              
              const box = boxData[index]
              if (!box || box.q1 === null || box.q1 === undefined || box.median === null || box.median === undefined || box.q3 === null || box.q3 === undefined) return
              
              const xScale = chart.scales.x
              const yScale = chart.scales.y
              
              const xQ1 = xScale.getPixelForValue(box.q1)
              const xMedian = xScale.getPixelForValue(box.median)
              const xQ3 = xScale.getPixelForValue(box.q3)
              
              // Use calculated whiskers if available, otherwise use min/max
              const lowerWhisker = box.lowerWhisker !== null && box.lowerWhisker !== undefined ? box.lowerWhisker : (box.min !== null && box.min !== undefined ? box.min : box.q1)
              const upperWhisker = box.upperWhisker !== null && box.upperWhisker !== undefined ? box.upperWhisker : (box.max !== null && box.max !== undefined ? box.max : box.q3)
              
              const xLowerWhisker = lowerWhisker !== null && lowerWhisker !== undefined ? xScale.getPixelForValue(lowerWhisker) : xQ1
              const xUpperWhisker = upperWhisker !== null && upperWhisker !== undefined ? xScale.getPixelForValue(upperWhisker) : xQ3
              
              const yCenter = bar.y
              const barWidth = bar.width
              
              ctx.save()
              ctx.strokeStyle = dataset.borderColor
              ctx.fillStyle = dataset.backgroundColor
              ctx.lineWidth = 1
              
              // Draw box (Q1 to Q3)
              ctx.fillRect(xQ1, yCenter - barWidth/2, xQ3 - xQ1, barWidth)
              ctx.strokeRect(xQ1, yCenter - barWidth/2, xQ3 - xQ1, barWidth)
              
              // Draw median line
              ctx.beginPath()
              ctx.moveTo(xMedian, yCenter - barWidth/2)
              ctx.lineTo(xMedian, yCenter + barWidth/2)
              ctx.stroke()
              
              // Draw whiskers (from box edges to whisker ends)
              ctx.beginPath()
              // Lower whisker
              ctx.moveTo(xLowerWhisker, yCenter)
              ctx.lineTo(xQ1, yCenter)
              ctx.moveTo(xLowerWhisker, yCenter - barWidth/4)
              ctx.lineTo(xLowerWhisker, yCenter + barWidth/4)
              // Upper whisker
              ctx.moveTo(xQ3, yCenter)
              ctx.lineTo(xUpperWhisker, yCenter)
              ctx.moveTo(xUpperWhisker, yCenter - barWidth/4)
              ctx.lineTo(xUpperWhisker, yCenter + barWidth/4)
              ctx.stroke()
              
              // Draw outliers if available
              if (box.outliers && box.outliers.length > 0) {
                ctx.fillStyle = dataset.borderColor
                box.outliers.forEach(outlier => {
                  const xOutlier = xScale.getPixelForValue(outlier)
                  ctx.beginPath()
                  ctx.arc(xOutlier, yCenter, 2, 0, 2 * Math.PI)
                  ctx.fill()
                })
              }
              
              ctx.restore()
            })
          })
        }
      }]
    }
  })
}

// Helper function to interpolate color
function interpolateColor(color1, color2, factor) {
  const result = color1.slice()
  for (let i = 0; i < 3; i++) {
    result[i] = Math.round(result[i] + factor * (color2[i] - color1[i]))
  }
  return result
}

// Convert RGB array to CSS color string
function rgbToColor(rgb) {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

// Generate color for heatmap value (0-1 scale)
function getHeatmapColor(value, min, max) {
  if (value === null || value === undefined || isNaN(value)) {
    return 'rgb(240, 240, 240)' // Light gray for missing data
  }
  
  // Normalize value to 0-1 range
  const normalized = (value - min) / (max - min)
  
  // Color gradient: blue (low) -> cyan -> yellow -> red (high)
  if (normalized < 0.33) {
    // Blue to Cyan
    const factor = normalized / 0.33
    const color = interpolateColor([0, 0, 255], [0, 255, 255], factor)
    return rgbToColor(color)
  } else if (normalized < 0.67) {
    // Cyan to Yellow
    const factor = (normalized - 0.33) / 0.34
    const color = interpolateColor([0, 255, 255], [255, 255, 0], factor)
    return rgbToColor(color)
  } else {
    // Yellow to Red
    const factor = (normalized - 0.67) / 0.33
    const color = interpolateColor([255, 255, 0], [255, 0, 0], factor)
    return rgbToColor(color)
  }
}

function renderHeatmap(data) {
  if (!chartCanvas.value || data.length === 0) {
    console.warn('Cannot render heatmap: no canvas or no data')
    return
  }
  
  destroyChart()
  
  const canvas = chartCanvas.value
  const ctx = canvas.getContext('2d')
  
  // Set canvas size if not already set
  if (!canvas.width || canvas.width < 800) {
    canvas.width = 800
  }
  if (!canvas.height || canvas.height < 600) {
    canvas.height = 600
  }
  
  const padding = { top: 80, right: 120, bottom: 80, left: 120 }
  
  // For heatmap, we need two grouping dimensions and one value dimension
  // Use X-axis field for rows, and user-selected column for columns
  const rowField = chartConfig.value.xAxis || 'name'
  const colField = chartConfig.value.heatmapColumn
  
  if (!colField) {
    // If no column selected, try to default to something reasonable or show error
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = '16px Arial'
    ctx.fillStyle = 'black'
    ctx.textAlign = 'center'
    ctx.fillText('Please select a Column (X-Axis) for the heatmap', canvas.width / 2, canvas.height / 2)
    return
  }
  
  const valueField = chartConfig.value.yAxis
  
  // Get unique row and column values
  const rowValues = [...new Set(data.map(item => String(item[rowField] || 'Unknown')))].sort()
  const colValues = [...new Set(data.map(item => String(item[colField] || 'Unknown')))].sort()
  
  // Build matrix
  const matrix = {}
  
  data.forEach(item => {
    const row = String(item[rowField] || 'Unknown')
    const col = String(item[colField] || 'Unknown')
    const key = `${row}|${col}`
    const value = parseFloat(item[valueField] || 0)
    
    if (!matrix[key]) {
      matrix[key] = { row, col, values: [], sum: 0, count: 0 }
    }
    matrix[key].values.push(value)
    matrix[key].sum += value
    matrix[key].count++
  })
  
  // Calculate averages for each cell
  const heatmapData = rowValues.map(row => {
    return colValues.map(col => {
      const key = `${row}|${col}`
      const cell = matrix[key]
      return cell && cell.count > 0 ? cell.sum / cell.count : null
    })
  })
  
  // Find min/max for color scaling
  const allValues = heatmapData.flat().filter(v => v !== null && !isNaN(v))
  if (allValues.length === 0) {
    alert('No valid numeric values found for heatmap')
    return
  }
  
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  
  // Calculate cell dimensions
  const cellWidth = Math.max(30, (canvas.width - padding.left - padding.right) / colValues.length)
  const cellHeight = Math.max(20, (canvas.height - padding.top - padding.bottom) / rowValues.length)
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // Draw cells
  rowValues.forEach((row, i) => {
    colValues.forEach((col, j) => {
      const value = heatmapData[i][j]
      const xPos = padding.left + j * cellWidth
      const yPos = padding.top + i * cellHeight
      
      // Draw cell
      ctx.fillStyle = getHeatmapColor(value, min, max)
      ctx.fillRect(xPos, yPos, cellWidth, cellHeight)
      
      // Draw border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.lineWidth = 1
      ctx.strokeRect(xPos, yPos, cellWidth, cellHeight)
      
      // Draw value text if cell is large enough
      if (cellWidth > 50 && cellHeight > 30 && value !== null && !isNaN(value)) {
        ctx.fillStyle = value < (min + max) / 2 ? 'white' : 'black'
        ctx.font = `${Math.min(12, cellHeight / 3)}px Arial`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(
          formatValue(value),
          xPos + cellWidth / 2,
          yPos + cellHeight / 2
        )
      }
    })
  })
  
  // Draw X-axis labels (columns)
  ctx.fillStyle = 'black'
  ctx.font = '11px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  colValues.forEach((col, j) => {
    const xPos = padding.left + j * cellWidth + cellWidth / 2
    const yPos = padding.top + rowValues.length * cellHeight + 10
    ctx.save()
    ctx.translate(xPos, yPos)
    ctx.rotate(-Math.PI / 4)
    const text = col.length > 15 ? col.substring(0, 12) + '...' : col
    ctx.fillText(text, 0, 0)
    ctx.restore()
  })
  
  // Draw Y-axis labels (rows)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  rowValues.forEach((row, i) => {
    const xPos = padding.left - 10
    const yPos = padding.top + i * cellHeight + cellHeight / 2
    const text = row.length > 25 ? row.substring(0, 22) + '...' : row
    ctx.fillText(text, xPos, yPos)
  })
  
  // Draw color legend
  const legendWidth = 25
  const legendHeight = 200
  const legendX = canvas.width - padding.right + 30
  const legendY = padding.top
  
  // Draw gradient
  for (let i = 0; i < legendHeight; i++) {
    const normalized = 1 - (i / legendHeight)
    const value = min + normalized * (max - min)
    ctx.fillStyle = getHeatmapColor(value, min, max)
    ctx.fillRect(legendX, legendY + i, legendWidth, 1)
  }
  
  // Draw legend border
  ctx.strokeStyle = 'black'
  ctx.lineWidth = 1
  ctx.strokeRect(legendX, legendY, legendWidth, legendHeight)
  
  // Draw legend labels
  ctx.fillStyle = 'black'
  ctx.font = '10px Arial'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(formatValue(max), legendX + legendWidth + 5, legendY)
  ctx.textBaseline = 'bottom'
  ctx.fillText(formatValue(min), legendX + legendWidth + 5, legendY + legendHeight)
  
  // Draw title
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = 'bold 16px Arial'
  const title = `${fieldDefinitions[chartConfig.value.dataSource]?.y.find(f => f.value === valueField)?.label || 'Value'} Heatmap`
  ctx.fillText(title, canvas.width / 2, 15)
  
  // Draw axis labels
  ctx.font = '12px Arial'
  ctx.textAlign = 'center'
  ctx.fillText(
    fieldDefinitions[chartConfig.value.dataSource]?.x.find(f => f.value === colField)?.label || colField,
    canvas.width / 2,
    canvas.height - 30
  )
  
  ctx.save()
  ctx.translate(20, canvas.height / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.fillText(
    fieldDefinitions[chartConfig.value.dataSource]?.x.find(f => f.value === rowField)?.label || rowField,
    0,
    0
  )
  ctx.restore()
}

function renderChart() {
  if (!chartData.value || !chartCanvas.value) return
  
  destroyChart()
  
  // Skip Chart.js rendering for heatmap (we use custom canvas rendering)
  if (chartConfig.value.type === 'heatmap') {
    return
  }
  
  const config = {
    type: chartConfig.value.type,
    data: chartData.value,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: chartConfig.value.type !== 'pie' && chartConfig.value.type !== 'doughnut',
          position: 'top'
        },
        title: {
          display: true,
          text: chartConfig.value.dataSource === 'calibration' 
            ? 'Calibration Plot: Power Users vs Regular Users'
            : chartConfig.value.dataSource === 'scanPassRates'
            ? 'Scan Pass Rate Distribution'
            : chartConfig.value.dataSource === 'raterBehavior'
            ? 'Rater Behavior: Pass Rate by User Type'
            : chartConfig.value.dataSource === 'timePatterns'
            ? 'Pass Rate Over Time'
            : chartConfig.value.dataSource === 'fatigue'
            ? 'Rater Fatigue: Cumulative Pass Rate by Vote Index'
            : chartConfig.value.dataSource === 'imageEntropy'
            ? 'Image Vote Entropy Distribution'
            : chartConfig.value.dataSource === 'imagePassRates'
            ? 'Pass Rate by Image Type'
            : chartConfig.value.dataSource === 'interRaterAgreement'
            ? 'Inter-Rater Agreement (Power Users)'
            : `${fieldDefinitions[chartConfig.value.dataSource]?.y.find(f => 
              f.value === (chartConfig.value.type === 'pie' || chartConfig.value.type === 'doughnut' 
                ? chartConfig.value.valueField 
                : chartConfig.value.yAxis)
            )?.label || 'Data'} by ${chartConfig.value.dataSource === 'overall' ? 'Overall' : 
            fieldDefinitions[chartConfig.value.dataSource]?.x.find(f => 
              f.value === (chartConfig.value.type === 'pie' || chartConfig.value.type === 'doughnut' 
                ? chartConfig.value.labelField 
                : chartConfig.value.xAxis)
            )?.label || 'Category'}${selectedStudyId.value ? ` (${studies.value.find(s => s.id === parseInt(selectedStudyId.value))?.name || 'Selected Study'})` : ''}`
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || ''
              if (label) {
                label += ': '
              }
              if (context.parsed.y !== null) {
                label += formatValue(context.parsed.y)
              }
              return label
            }
          }
        }
      },
      scales: chartConfig.value.type !== 'pie' && chartConfig.value.type !== 'doughnut' && chartConfig.value.type !== 'scatter' ? {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return formatValue(value)
            }
          }
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      } : chartConfig.value.type === 'scatter' || chartConfig.value.dataSource === 'calibration' ? {
        x: {
          type: 'linear',
          position: 'bottom',
          min: chartConfig.value.dataSource === 'calibration' ? 0 : undefined,
          max: chartConfig.value.dataSource === 'calibration' ? 1 : undefined,
          title: {
            display: true,
            text: chartConfig.value.dataSource === 'calibration' 
              ? 'Power User Pass Rate' 
              : (fieldDefinitions[chartConfig.value.dataSource]?.x.find(f => f.value === chartConfig.value.xAxis)?.label || 'X Axis')
          }
        },
        y: {
          type: 'linear',
          min: chartConfig.value.dataSource === 'calibration' ? 0 : undefined,
          max: chartConfig.value.dataSource === 'calibration' ? 1 : undefined,
          beginAtZero: chartConfig.value.dataSource !== 'calibration',
          title: {
            display: true,
            text: chartConfig.value.dataSource === 'calibration' 
              ? 'Regular User Pass Rate' 
              : (fieldDefinitions[chartConfig.value.dataSource]?.y.find(f => f.value === chartConfig.value.yAxis)?.label || 'Y Axis')
          }
        }
      } : undefined
    }
  }
  
  chart.value = new Chart(chartCanvas.value, config)
}

function destroyChart() {
  if (chart.value) {
    chart.value.destroy()
    chart.value = null
  }
}

function generateColors(count) {
  const colors = [
    'rgba(255, 99, 132, 0.6)',
    'rgba(54, 162, 235, 0.6)',
    'rgba(255, 206, 86, 0.6)',
    'rgba(75, 192, 192, 0.6)',
    'rgba(153, 102, 255, 0.6)',
    'rgba(255, 159, 64, 0.6)',
    'rgba(199, 199, 199, 0.6)',
    'rgba(83, 102, 255, 0.6)',
    'rgba(255, 99, 255, 0.6)',
    'rgba(99, 255, 132, 0.6)'
  ]
  
  const result = []
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length])
  }
  return result
}

function formatValue(value) {
  if (value === null || value === undefined) return 'N/A'
  if (typeof value === 'number') {
    if (value % 1 === 0) return value.toString()
    return value.toFixed(2)
  }
  return value.toString()
}

function downloadChart() {
  // Handle heatmap separately (rendered directly on canvas)
  if (chartConfig.value.type === 'heatmap' && chartCanvas.value) {
    const url = chartCanvas.value.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = `heatmap-${Date.now()}.png`
    link.href = url
    link.click()
    return
  }
  
  if (!chart.value) return
  const url = chart.value.toBase64Image()
  const link = document.createElement('a')
  link.download = `chart-${Date.now()}.png`
  link.href = url
  link.click()
}

function getExportFilename() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const dataSource = chartConfig.value.dataSource || 'data'
  const studyFilter = selectedStudyId.value ? `-study-${selectedStudyId.value}` : ''
  return `stats-export-${dataSource}${studyFilter}-${timestamp}`
}

function exportToCSV(data, filename) {
  if (!data || data.length === 0) return

  // Get all unique keys from all objects
  const allKeys = new Set()
  data.forEach(item => {
    Object.keys(item).forEach(key => allKeys.add(key))
  })
  const headers = Array.from(allKeys)

  // Create CSV content
  let csv = headers.join(',') + '\n'

  data.forEach(item => {
    const row = headers.map(header => {
      const value = item[header]
      if (value === null || value === undefined) return ''
      // Escape commas and quotes in CSV
      const stringValue = String(value)
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`
      }
      return stringValue
    })
    csv += row.join(',') + '\n'
  })

  // Create download link
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function exportToJSON(data, filename) {
  // API client for CMI NeuroQC Offline
  // Replaces Supabase client with local API calls
  // Fixed syntax errors - v2t
  if (!data || data.length === 0) return

  // Prepare export object with metadata
  const exportData = {
    exportDate: new Date().toISOString(),
    dataSource: chartConfig.value.dataSource,
    chartConfig: {
      type: chartConfig.value.type,
      xAxis: chartConfig.value.xAxis,
      yAxis: chartConfig.value.yAxis,
      labelField: chartConfig.value.labelField,
      valueField: chartConfig.value.valueField,
      limit: chartConfig.value.limit
    },
    studyFilter: selectedStudyId.value || null,
    recordCount: data.length,
    data: data
  }

  // Create download link
  const jsonString = JSON.stringify(exportData, null, 2)
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}.json`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function exportAllStats() {
  if (!stats.value) {
    alert('Please load stats data first by clicking "Refresh Data"')
    return
  }

  try {
    // Prepare comprehensive export with all stats
    const exportData = {
      exportDate: new Date().toISOString(),
      exportType: 'complete_stats',
      overall: stats.value.overall,
      perStudy: stats.value.perStudy,
      perDataset: stats.value.perDataset,
      perImage: stats.value.perImage,
      perRater: stats.value.perRater,
      recentVotes: stats.value.recentVotes,
      sites: stats.value.sites || null,
      generatedAt: stats.value.generatedAt
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const filename = `complete-stats-export-${timestamp}`

    // Create download link
    const jsonString = JSON.stringify(exportData, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${filename}.json`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error exporting all stats:', error)
    alert('Failed to export all stats: ' + error.message)
  }
}

async function exportSamplesVotes(datasetId = null, showAll = false) {
  try {
    let url = '/admin/export/samples-votes'
    if (datasetId && !showAll) {
      url += `?dataset_id=${datasetId}`
    }

    // Get API base URL (same logic as api.js)
    let apiBaseUrl
    if (import.meta.env.VITE_API_URL) {
      apiBaseUrl = import.meta.env.VITE_API_URL
    } else {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
      const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
      apiBaseUrl = `${protocol}//${hostname}:3000/api`
    }
    
    const fullUrl = `${apiBaseUrl}${url}`
    
    // Use fetch directly to get CSV (not JSON)
    const csvResponse = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${api.token}`,
        'Accept': 'text/csv'
      },
      credentials: 'include'
    })

    if (!csvResponse.ok) {
      const errorText = await csvResponse.text()
      let errorMessage = `Export failed: ${csvResponse.status} ${csvResponse.statusText}`
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error || errorMessage
      } catch {
        // Not JSON, use the text as is
        if (errorText) errorMessage = errorText
      }
      throw new Error(errorMessage)
    }

    const csvBlob = await csvResponse.blob()
    const blobUrl = URL.createObjectURL(csvBlob)
    
    // Get filename from Content-Disposition header or generate one
    const contentDisposition = csvResponse.headers.get('Content-Disposition')
    let filename = 'samples-votes-export.csv'
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/)
      if (filenameMatch) {
        filename = filenameMatch[1]
      }
    }

    const link = document.createElement('a')
    link.setAttribute('href', blobUrl)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(blobUrl)
  } catch (error) {
    console.error('Error exporting samples and votes:', error)
    alert('Failed to export samples and votes: ' + error.message)
  }
}

async function loadStats() {
  loading.value = true
  try {
    const data = await api.getSwipeStats()
    stats.value = data
    
    // Load sites data if needed
    if (chartConfig.value.dataSource === 'sites') {
      try {
        const sitesData = await api.getSitesEulerStats()
        if (!stats.value) stats.value = {}
        stats.value.sites = sitesData
      } catch (error) {
        console.error('Error loading sites euler stats:', error)
        if (!stats.value) stats.value = {}
        stats.value.sites = []
      }
    }
    
    updateChart()
  } catch (error) {
    console.error('Error loading swipe stats:', error)
  } finally {
    loading.value = false
  }
}

async function loadAdvancedStats() {
  loading.value = true
  try {
    const data = await api.getAdvancedStats()
    advancedStats.value = data
    updateChart()
  } catch (error) {
    console.error('Error loading advanced stats:', error)
    alert('Failed to load advanced statistics: ' + (error.message || 'Unknown error'))
  } finally {
    loading.value = false
  }
}

async function loadStudies() {
  try {
    const studiesData = await api.getAdminStudies()
    studies.value = studiesData || []
  } catch (error) {
    console.error('Error loading studies:', error)
    studies.value = []
  }
}

onMounted(() => {
  loadStudies()
  loadStats()
})

onUnmounted(() => {
  destroyChart()
})
</script>

<style scoped>
canvas {
  max-height: 600px;
}

.sticky-top {
  position: sticky;
  top: 0;
  z-index: 10;
}

.card {
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
</style>

