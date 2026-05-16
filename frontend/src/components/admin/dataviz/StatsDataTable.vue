<template>
  <div class="card mt-4" v-if="data && data.length > 0">
    <div class="card-header">
      <h6 class="mb-0">Raw Data ({{ data.length }} items)</h6>
    </div>
    <div class="card-body">
      <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
        <table class="table table-sm table-hover">
          <thead class="sticky-top bg-light">
            <tr>
              <th v-for="field in tableFields" :key="field">{{ field }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in data" :key="index">
              <td v-for="field in tableFields" :key="field">
                {{ formatValue(item[field]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: {
    type: Array,
    required: true,
    default: () => []
  },
  dataSource: {
    type: String,
    default: ''
  }
})

const tableFields = computed(() => {
  if (props.data.length === 0) return []
  const fields = Object.keys(props.data[0])
  return fields.filter(f => f !== 'id' || props.dataSource === 'overall')
})

function formatValue(val) {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'number') {
    // Check if integer
    if (Number.isInteger(val)) return val
    // Format float
    return Math.round(val * 100) / 100
  }
  return val
}
</script>
