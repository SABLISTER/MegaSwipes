<template>
  <div class="card mb-4">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h6 class="mb-0">Chart Configuration</h6>
      <button @click="$emit('reset')" class="btn btn-sm btn-outline-secondary">
        ↺ Reset Config
      </button>
    </div>
    <div class="card-body">
      <div class="row g-3">
        <!-- 1. Data Source & Type -->
        <div class="col-md-12">
          <label class="form-label fw-bold border-bottom w-100 pb-1 mb-2">1. Data Source & Visualization</label>
        </div>
        
        <div class="col-md-4">
          <label class="form-label">Data Source</label>
          <select 
            :value="config.dataSource" 
            @input="updateField('dataSource', $event.target.value)" 
            class="form-select"
          >
            <optgroup label="Basic Stats">
              <option value="perStudy">By Study</option>
              <option value="perDataset">By Dataset</option>
              <option value="perImage">By Image (Top 50)</option>
              <option value="perRater">By Rater</option>
              <option value="overall">Overall (Single Value)</option>
            </optgroup>
            <optgroup label="Advanced QC">
              <option value="sites">By Site (Euler Numbers)</option>
              <option value="scanPassRates">Scan Pass Rates</option>
              <option value="imagePassRates">Image Type Pass Rates</option>
              <option value="raterBehavior">Rater Behavior</option>
              <option value="interRaterAgreement">Inter-Rater Agreement</option>
              <option value="timePatterns">Pass Rate Over Time</option>
              <option value="fatigue">Rater Fatigue</option>
              <option value="imageEntropy">Image Vote Entropy</option>
              <option value="calibration">Calibration (Power vs Regular)</option>
              <option value="sitePassRates">Site Pass Rates</option>
              <option value="eulerVsPassRate">Euler vs Pass Rate</option>
            </optgroup>
          </select>
          <div class="form-text small text-muted mt-1">
            {{ getDataSourceDescription(config.dataSource) }}
          </div>
        </div>

        <div class="col-md-4">
          <label class="form-label">Chart Type</label>
          <select 
            :value="config.type" 
            @input="updateField('type', $event.target.value)" 
            class="form-select"
          >
            <option value="bar" :disabled="isChartTypeDisabled('bar')">Bar Chart</option>
            <option value="line" :disabled="isChartTypeDisabled('line')">Line Chart</option>
            <option value="pie" :disabled="isChartTypeDisabled('pie')">Pie Chart</option>
            <option value="doughnut" :disabled="isChartTypeDisabled('doughnut')">Doughnut Chart</option>
            <option value="scatter" :disabled="isChartTypeDisabled('scatter')">Scatter Plot</option>
            <option value="box" :disabled="isChartTypeDisabled('box')">Box & Whisker Plot</option>
            <option value="heatmap" :disabled="isChartTypeDisabled('heatmap')">Heatmap</option>
          </select>
        </div>

        <div class="col-md-4" v-if="['perStudy', 'perDataset', 'perImage'].includes(config.dataSource)">
          <label class="form-label">Filter by Study</label>
          <select 
            :value="selectedStudyId" 
            @input="$emit('update:selectedStudyId', $event.target.value)" 
            class="form-select"
          >
            <option value="">All Studies</option>
            <option v-for="study in studies" :key="study.id" :value="study.id">
              {{ study.name }}
            </option>
          </select>
        </div>

        <!-- 2. Axes & Dimensions -->
        <div class="col-md-12 mt-4" v-if="config.dataSource !== 'overall'">
          <label class="form-label fw-bold border-bottom w-100 pb-1 mb-2">2. Axes & Dimensions</label>
        </div>

        <!-- X Axis / Row (Heatmap) / Label (Pie) -->
        <div class="col-md-4" v-if="showXAxisSelector">
          <label class="form-label">
            {{ config.type === 'heatmap' ? 'Row (Y-Axis)' : (config.type === 'pie' || config.type === 'doughnut' ? 'Label Field' : 'X Axis') }}
          </label>
          <select 
            :value="config.xAxis" 
            @input="updateField('xAxis', $event.target.value)" 
            class="form-select"
          >
            <option v-for="field in availableXFields" :key="field.value" :value="field.value">
              {{ field.label }}
            </option>
          </select>
        </div>

        <!-- Heatmap Column (New) -->
        <div class="col-md-4" v-if="config.type === 'heatmap'">
          <label class="form-label">Column (X-Axis)</label>
          <select 
            :value="config.heatmapColumn" 
            @input="updateField('heatmapColumn', $event.target.value)" 
            class="form-select"
          >
             <option value="" disabled>Select a column...</option>
             <option v-for="field in availableXFields" :key="field.value" :value="field.value" :disabled="field.value === config.xAxis">
              {{ field.label }}
            </option>
            <!-- Add extra useful fields for columns if not already in X fields -->
            <option value="study_name" v-if="!availableXFields.some(f => f.value === 'study_name')">Study Name</option>
            <option value="dataset_name" v-if="!availableXFields.some(f => f.value === 'dataset_name')">Dataset Name</option>
          </select>
        </div>

        <!-- Y Axis / Value (Heatmap/Pie) -->
        <div class="col-md-4" v-if="showYAxisSelector">
          <label class="form-label">
            {{ config.type === 'heatmap' ? 'Value (Color)' : (config.type === 'pie' || config.type === 'doughnut' ? 'Value Field' : 'Y Axis') }}
          </label>
          <select 
            :value="config.yAxis" 
            @input="updateField('yAxis', $event.target.value)" 
            class="form-select"
          >
            <option v-for="field in availableYFields" :key="field.value" :value="field.value">
              {{ field.label }}
            </option>
          </select>
        </div>

        <!-- Limit -->
        <div class="col-md-4" v-if="config.dataSource === 'perImage'">
          <label class="form-label">Limit Results</label>
          <input 
            type="number" 
            :value="config.limit" 
            @input="updateField('limit', parseInt($event.target.value))" 
            class="form-control" 
            min="10" 
            max="100" 
          >
        </div>
      </div>

      <div class="mt-4 d-flex justify-content-end">
        <button @click="$emit('refresh')" class="btn btn-primary">
          🔄 Update Chart
        </button>
        <button @click="$emit('download')" class="btn btn-outline-secondary ms-2" v-if="hasChart">
          📥 Download Chart
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  config: { type: Object, required: true },
  studies: { type: Array, default: () => [] },
  selectedStudyId: { type: [String, Number], default: '' },
  hasChart: { type: Boolean, default: false },
  fieldDefinitions: { type: Object, required: true }
})

const emit = defineEmits(['update:config', 'update:selectedStudyId', 'reset', 'refresh', 'download'])

function updateField(field, value) {
  emit('update:config', { ...props.config, [field]: value })
}

const showXAxisSelector = computed(() => {
  return props.config.type !== 'pie' && 
         props.config.type !== 'doughnut' && 
         props.config.type !== 'heatmap'
})

const showYAxisSelector = computed(() => {
  return props.config.type !== 'pie' && 
         props.config.type !== 'doughnut'
})

const availableXFields = computed(() => {
  return props.fieldDefinitions[props.config.dataSource]?.x || []
})

const availableYFields = computed(() => {
  return props.fieldDefinitions[props.config.dataSource]?.y || []
})

function getDataSourceDescription(source) {
  const descriptions = {
    perStudy: 'Compare statistics across different studies',
    perDataset: 'Compare statistics across different datasets',
    perImage: 'View statistics for individual images (limited to top 50)',
    perRater: 'Analyze rater performance and activity',
    overall: 'View aggregate statistics for the entire system',
    sites: 'Analyze Euler number distributions across different sites',
    scanPassRates: 'Distribution of pass rates per scan (subject)',
    imagePassRates: 'Pass rates based on image type/position',
    raterBehavior: 'Compare pass rates between user types',
    interRaterAgreement: 'Agreement levels between power users',
    timePatterns: 'Track pass rates over time',
    fatigue: 'Analyze how pass rates change during a rating session',
    imageEntropy: 'Measure voting consistency/ambiguity per image',
    calibration: 'Compare power user vs regular user pass rates',
    sitePassRates: 'Pass rates aggregated by Site/Dataset',
    eulerVsPassRate: 'Correlation between Euler Number and Pass Rate'
  }
  return descriptions[source] || ''
}

function isChartTypeDisabled(type) {
  const source = props.config.dataSource
  
  if (source === 'overall') return true
  
  if (source === 'sites') {
    return type !== 'box'
  }
  
  if (['scanPassRates', 'imagePassRates', 'raterBehavior', 'sitePassRates'].includes(source)) {
    return type !== 'bar'
  }
  if (['timePatterns', 'fatigue'].includes(source)) {
    return type !== 'line'
  }
  if (['calibration', 'imageEntropy', 'eulerVsPassRate'].includes(source)) {
    return type !== 'scatter'
  }
  
  if (type === 'heatmap') {
    return false
  }
  
  return false
}
</script>
