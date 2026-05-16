<template>
  <div class="card mb-4">
    <div class="card-header d-flex justify-content-between align-items-center">
      <h6 class="mb-0">Custom Data for Comparison</h6>
      <div>
        <button @click="showCustomData = !showCustomData" class="btn btn-sm btn-outline-primary">
          {{ showCustomData ? 'Hide' : 'Show' }} Custom Data
        </button>
        <button @click="clearCustomData" class="btn btn-sm btn-outline-danger ms-2" v-if="modelValue.length > 0">
          Clear All
        </button>
      </div>
    </div>
    <div class="card-body" v-if="showCustomData">
      <p class="text-muted small mb-3">
        Enter custom data points (e.g., average euler numbers, quartiles) to compare against real-time data.
      </p>
      
      <div v-for="(entry, index) in modelValue" :key="index" class="custom-data-entry mb-3 p-3 border rounded">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong>Entry {{ index + 1 }}</strong>
          <button @click="removeEntry(index)" class="btn btn-sm btn-outline-danger">Remove</button>
        </div>
        <div class="row g-2">
          <div class="col-md-3">
            <label class="form-label small">Site Name</label>
            <input v-model="entry.siteName" type="text" class="form-control form-control-sm" placeholder="Site name" />
          </div>
          <div class="col-md-2">
            <label class="form-label small">Average</label>
            <input v-model.number="entry.average" type="number" step="0.01" class="form-control form-control-sm" placeholder="Mean" />
          </div>
          <div class="col-md-2">
            <label class="form-label small">Std Dev</label>
            <input v-model.number="entry.stdDev" type="number" step="0.01" class="form-control form-control-sm" placeholder="Std" />
          </div>
          <div class="col-md-1">
            <label class="form-label small">Q1</label>
            <input v-model.number="entry.q1" type="number" step="0.01" class="form-control form-control-sm" placeholder="Q1" />
          </div>
          <div class="col-md-1">
            <label class="form-label small">Median</label>
            <input v-model.number="entry.median" type="number" step="0.01" class="form-control form-control-sm" placeholder="Q2" />
          </div>
          <div class="col-md-1">
            <label class="form-label small">Q3</label>
            <input v-model.number="entry.q3" type="number" step="0.01" class="form-control form-control-sm" placeholder="Q3" />
          </div>
          <div class="col-md-1">
            <label class="form-label small">Min</label>
            <input v-model.number="entry.min" type="number" step="0.01" class="form-control form-control-sm" placeholder="Min" />
          </div>
          <div class="col-md-1">
            <label class="form-label small">Max</label>
            <input v-model.number="entry.max" type="number" step="0.01" class="form-control form-control-sm" placeholder="Max" />
          </div>
        </div>
      </div>
      
      <button @click="addEntry" class="btn btn-sm btn-outline-primary">
        + Add Custom Data Entry
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const showCustomData = ref(false)

function addEntry() {
  const newEntry = {
    siteName: '',
    average: null,
    stdDev: null,
    q1: null,
    median: null,
    q3: null,
    min: null,
    max: null
  }
  emit('update:modelValue', [...props.modelValue, newEntry])
}

function removeEntry(index) {
  const newEntries = [...props.modelValue]
  newEntries.splice(index, 1)
  emit('update:modelValue', newEntries)
}

function clearCustomData() {
  emit('update:modelValue', [])
}
</script>
