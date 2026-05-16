<template>
  <div class="swipe-view">
    <div class="swipe-header mb-4">
      <h2>{{ datasetName }}</h2>
      <div class="stats">
        <span class="badge bg-primary me-2">Score: {{ userScore }}</span>
        <span class="badge bg-secondary">Remaining: {{ remainingSamples }}</span>
      </div>
    </div>

    <div v-if="loading" class="text-center">
      <div class="spinner-border" role="status">
        <span class="visually-hidden">Loading...</span>
      </div>
    </div>

    <div v-else-if="!currentSample" class="alert alert-info">
      <h4>No more samples available</h4>
      <p>You've reviewed all available samples in this dataset. Great work!</p>
      <router-link to="/datasets" class="btn btn-primary">Back to Datasets</router-link>
    </div>

    <div v-else class="swipe-container">
      <div class="image-container" ref="imageContainer">
        <img
          :src="currentImageUrl"
          alt="Brain scan image"
          class="brain-image"
          @load="handleImageLoad"
          @error="handleImageError"
        >
        <div v-if="!imageLoaded" class="image-loader">
          <div class="spinner-border"></div>
          <div v-if="isRetrying" class="mt-2 text-muted">
            <small>Retrying...</small>
          </div>
        </div>
        <div v-if="currentSampleFailedTwice" class="alert alert-warning mt-2">
          <small>⚠️ Image failed to load. Skipping to next sample...</small>
        </div>
      </div>

      <div class="comment-section mt-4">
        <textarea
          ref="commentTextarea"
          v-model="comment"
          class="form-control"
          placeholder="Add a comment about this image (optional)..."
          rows="3"
          :disabled="!imageLoaded"
        ></textarea>
      </div>

      <div class="controls mt-3">
        <button
          class="btn btn-danger btn-lg me-3"
          @click="handleSwipe('fail')"
          :disabled="!imageLoaded"
        >
          <span class="fs-3">👎</span> Fail
        </button>
        <button
          class="btn btn-success btn-lg"
          @click="handleSwipe('pass')"
          :disabled="!imageLoaded"
        >
          <span class="fs-3">👍</span> Pass
        </button>
      </div>

      <div class="keyboard-hint mt-3 text-muted">
        <small>Keyboard: ← Fail | → Pass</small>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const datasetId = route.params.datasetId;
const datasetName = ref('');
const currentSample = ref(null);
const imageLoaded = ref(false);
const loading = ref(true);
const userScore = ref(0);
const remainingSamples = ref(0);
const comment = ref('');
const commentTextarea = ref(null);
const showMeow = ref(false);

// Track failed samples: Map<sampleId, failureCount>
// failureCount: 1 = first failure (will retry), 2+ = second failure (will skip)
const failedSamples = ref(new Map());
const isRetrying = ref(false);

// Track cache buster that updates when sample changes
const imageCacheBuster = ref(Date.now());

// Watch for sample changes and update cache buster
watch(() => currentSample.value?.id, (newId) => {
  if (newId) {
    imageCacheBuster.value = Date.now();
    isRetrying.value = false;
  }
});

// Easter egg: show "meow" when "rigatoni" or "sharky" is typed in comments
watch(comment, (newComment) => {
  const lowerComment = newComment.toLowerCase();
  if (lowerComment.includes('rigatoni') || lowerComment.includes('sharky')) {
    showMeow.value = true;
    // Hide after 3 seconds
    setTimeout(() => {
      showMeow.value = false;
    }, 3000);
  }
});

const currentImageUrl = computed(() => {
  if (!currentSample.value) return '';
  // Use secure_token if available, otherwise fall back to sample ID route (requires auth)
  if (currentSample.value.secure_token) {
    return `/api/images/${currentSample.value.secure_token}?t=${imageCacheBuster.value}`;
  } else {
    // Use authenticated route for samples without secure_token
    return `/api/samples/${currentSample.value.id}/image?t=${imageCacheBuster.value}`;
  }
});

const currentSampleFailedTwice = computed(() => {
  if (!currentSample.value) return false;
  const failureCount = failedSamples.value.get(currentSample.value.id) || 0;
  return failureCount >= 2;
});

async function loadDataset() {
  try {
    const dataset = await api.getDataset(datasetId);
    datasetName.value = dataset.name;
  } catch (error) {
    console.error('Error loading dataset:', error);
  }
}

async function loadNextSample(skipCurrent = false) {
  // Clear current sample first to prevent stale image URLs
  const previousSample = currentSample.value;
  currentSample.value = null;
  imageLoaded.value = false;
  
  // Small delay to ensure image URL is cleared before loading new one
  await new Promise(resolve => setTimeout(resolve, 50));
  
  try {
    // Get all samples with user_voted flag
    const samples = await api.getDatasetSamples(datasetId);
    
    // Filter unvoted samples
    let unvotedSamples = samples.filter(s => !s.user_voted);
    
    // Update remaining count (show all unvoted, not just available)
    remainingSamples.value = unvotedSamples.length;
    
    // Filter out samples that have failed twice (but keep them in the cycle for later)
    // We'll skip them for now but they can be retried later
    const availableSamples = unvotedSamples.filter(s => {
      const failureCount = failedSamples.value.get(s.id) || 0;
      return failureCount < 2;
    });
    
    // If we have available samples, use those; otherwise use all unvoted samples
    // Include samples with or without secure_token - let error handling deal with missing tokens
    const samplesToShuffle = availableSamples.length > 0 ? availableSamples : unvotedSamples;
    
    // Randomize the order of samples to avoid predictable sequences
    // This ensures images from the same subject (A1, A2, S1, S2) aren't served sequentially
    const shuffled = [...samplesToShuffle];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // Set the current sample (first from randomized list)
    if (shuffled.length > 0) {
      currentSample.value = shuffled[0];
    } else {
      // Only set to null if there are truly no unvoted samples
      currentSample.value = null;
    }
  } catch (error) {
    console.error('Error loading samples:', error);
    currentSample.value = null;
  } finally {
    loading.value = false;
  }
}

async function handleImageError(event) {
  if (!currentSample.value) return;
  
  const sampleId = currentSample.value.id;
  const img = event.target;
  
  // Check if this is a 404 error
  // We can't directly check status code from img error event, but we can infer from the error
  // If the image fails to load, it's likely a 404 or network error
  
  const currentFailureCount = failedSamples.value.get(sampleId) || 0;
  const newFailureCount = currentFailureCount + 1;
  
  console.warn(`Image failed to load (attempt ${newFailureCount}):`, {
    sampleId,
    url: currentImageUrl.value,
    sample: currentSample.value
  });
  
  // Update failure count
  failedSamples.value.set(sampleId, newFailureCount);
  
  if (newFailureCount === 1) {
    // First failure: retry once
    console.log(`Retrying sample ${sampleId}...`);
    isRetrying.value = true;
    
    // Wait a bit before retry
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Retry with cache busting
    if (currentSample.value && currentSample.value.id === sampleId) {
      imageCacheBuster.value = Date.now();
      // Use secure_token if available, otherwise use sample ID route
      const retryUrl = currentSample.value.secure_token
        ? `/api/images/${currentSample.value.secure_token}?retry=${Date.now()}`
        : `/api/samples/${currentSample.value.id}/image?retry=${Date.now()}`;
      img.src = retryUrl;
    }
  } else if (newFailureCount >= 2) {
    // Second failure: skip to next sample automatically
    console.warn(`Sample ${sampleId} failed twice, skipping to next sample...`);
    
    // Wait a moment to show the error, then auto-skip
    setTimeout(async () => {
      // Skip to next sample without voting
      await loadNextSample(true);
    }, 1000);
  }
}

function handleImageLoad() {
  imageLoaded.value = true;
  // Clear failure count on successful load
  if (currentSample.value) {
    failedSamples.value.delete(currentSample.value.id);
  }
  isRetrying.value = false;
}

async function handleSwipe(rating) {
  if (!currentSample.value) return;

  const ratingValue = rating === 'pass' ? 1 : 0;

  try {
    // Record the vote with comment
    await api.createVote(currentSample.value.id, ratingValue, comment.value);
    
    // Clear failure count for successfully voted sample
    failedSamples.value.delete(currentSample.value.id);
    
    // Update user score
    userScore.value += 1;
    
    // Clear comment for next sample
    comment.value = '';
    
    // Load next sample
    await loadNextSample();
  } catch (error) {
    console.error('Error recording vote:', error);
    alert('Failed to record vote. Please try again.');
  }
}

function handleKeyPress(event) {
  if (!imageLoaded.value || !currentSample.value) return;
  
  if (event.key === 'ArrowLeft') {
    handleSwipe('fail');
  } else if (event.key === 'ArrowRight') {
    handleSwipe('pass');
  } else {
    // Check if a printable character was typed and no input is focused
    const activeElement = document.activeElement;
    const isInputFocused = activeElement && (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      activeElement.isContentEditable
    );
    
    // Check if it's a printable character (length 1, not a special key)
    const isPrintableChar = event.key.length === 1 && 
                            !event.ctrlKey && 
                            !event.metaKey && 
                            !event.altKey &&
                            event.key !== 'Enter' &&
                            event.key !== 'Tab' &&
                            event.key !== 'Escape';
    
    if (isPrintableChar && !isInputFocused && commentTextarea.value) {
      // Prevent default to avoid double insertion
      event.preventDefault();
      // Focus the comments textarea
      commentTextarea.value.focus();
      // Manually insert the character at the cursor position
      const textarea = commentTextarea.value;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = comment.value;
      comment.value = text.substring(0, start) + event.key + text.substring(end);
      // Set cursor position after the inserted character
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1;
      }, 0);
    }
  }
}

onMounted(async () => {
  // Load user score
  if (authStore.user) {
    userScore.value = authStore.user.total_score || 0;
  }
  
  await loadDataset();
  await loadNextSample();
  
  // Add keyboard event listener
  window.addEventListener('keydown', handleKeyPress);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyPress);
});
</script>

<style scoped>
.swipe-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.swipe-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}

.swipe-container {
  text-align: center;
}

.image-container {
  position: relative;
  background: #f8f9fa;
  border-radius: 8px;
  overflow: auto;
  min-height: 800px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.brain-image {
  transform: scale(1);
  transform-origin: center;
  max-width: 600;
  max-height: 600px;
  object-fit: scale-down;
}

.image-loader {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.controls {
  display: flex;
  justify-content: center;
  gap: 20px;
}

.comment-section {
  max-width: 600px;
  margin: 0 auto;
}

.comment-section textarea {
  resize: vertical;
  min-height: 80px;
}

.meow-easter-egg {
  margin-top: 10px;
  text-align: center;
  animation: meowPop 0.5s ease-out;
}

.meow-text {
  display: inline-block;
  font-size: 2rem;
  font-weight: bold;
  color: #ff6b9d;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
  animation: meowBounce 1s ease-in-out infinite;
}

@keyframes meowPop {
  0% {
    opacity: 0;
    transform: scale(0.5);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes meowBounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.keyboard-hint {
  text-align: center;
}

@media (max-width: 1152px) {
  .swipe-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .stats {
    margin-top: 10px;
  }
}
</style>

