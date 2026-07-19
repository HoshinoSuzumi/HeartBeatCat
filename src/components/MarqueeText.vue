<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue'

const props = defineProps<{ text: string }>()

const containerRef = ref<HTMLElement>()
const textWrapperRef = ref<HTMLElement>()
const isOverflowing = ref(false)
const translateDistance = ref(0)
const showLeftOverlay = ref(false)
const showRightOverlay = ref(false)

const animStyle = computed(() => {
  if (!isOverflowing.value) return {}
  const dist = translateDistance.value
  const dur = Math.max(3, dist / 40)
  return {
    '--marquee-offset': `-${dist}px`,
    animationDuration: `${dur}s`,
  }
})

let rafId: number | null = null

function updateOverlays() {
  if (!textWrapperRef.value || !isOverflowing.value) return
  const matrix = new DOMMatrixReadOnly(getComputedStyle(textWrapperRef.value).transform)
  const currentX = matrix.m41
  const offset = translateDistance.value

  showLeftOverlay.value = currentX < -1
  showRightOverlay.value = currentX > -offset + 1

  rafId = requestAnimationFrame(updateOverlays)
}

function startOverlayTracking() {
  if (rafId == null && isOverflowing.value) {
    rafId = requestAnimationFrame(updateOverlays)
  }
}

function stopOverlayTracking() {
  if (rafId != null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  showLeftOverlay.value = false
  showRightOverlay.value = false
}

function measure() {
  if (!containerRef.value || !textWrapperRef.value) return
  const containerWidth = containerRef.value.clientWidth
  const textWidth = textWrapperRef.value.scrollWidth
  if (textWidth > containerWidth) {
    isOverflowing.value = true
    translateDistance.value = textWidth - containerWidth + 8
    startOverlayTracking()
  } else {
    isOverflowing.value = false
    stopOverlayTracking()
  }
}

let observer: ResizeObserver | null = null

onMounted(() => {
  nextTick(measure)
  observer = new ResizeObserver(measure)
  if (containerRef.value) observer.observe(containerRef.value)
})

onUnmounted(() => {
  observer?.disconnect()
  stopOverlayTracking()
})

watch(() => props.text, () => {
  nextTick(measure)
})
</script>

<template>
  <div ref="containerRef" class="marquee-container">
    <div class="marquee-overlay left" :class="{ visible: showLeftOverlay }" />
    <span
      ref="textWrapperRef"
      class="marquee-text"
      :class="{ animating: isOverflowing }"
      :style="animStyle"
    >{{ text }}</span>
    <div class="marquee-overlay right" :class="{ visible: showRightOverlay }" />
  </div>
</template>

<style scoped>
.marquee-container {
  position: relative;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}

.marquee-text {
  display: inline-block;
  white-space: nowrap;
}

.marquee-overlay {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 16px;
  z-index: 1;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.marquee-overlay.left {
  left: 0;
  background: linear-gradient(to right, rgb(229, 229, 229), transparent);
}

.marquee-overlay.right {
  right: 0;
  background: linear-gradient(to left, rgb(229, 229, 229), transparent);
}

.marquee-overlay.visible {
  opacity: 1;
}
</style>

<style>
@keyframes marquee-scroll {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(var(--marquee-offset));
  }
}

.marquee-text.animating {
  animation-name: marquee-scroll;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
  animation-duration: var(--marquee-duration, 3s);
  animation-delay: 0.5s;
}
</style>
