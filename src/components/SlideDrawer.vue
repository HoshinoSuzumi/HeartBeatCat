<script setup lang="ts">
import gsap from "gsap"
import { nextTick, onMounted, ref, watch } from "vue"

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const overlayRef = ref<HTMLElement>()
const backdropRef = ref<HTMLElement>()
const panelRef = ref<HTMLElement>()
const isVisible = ref(false)
let isAnimating = false

function animateIn() {
  isAnimating = true
  const tl = gsap.timeline({ onComplete: () => { isAnimating = false } })
  tl.fromTo(backdropRef.value!, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power2.out" }, 0)
  tl.fromTo(panelRef.value!, { x: "100%" }, { x: "0%", duration: 0.28, ease: "power3.out" }, 0)
}

function animateOut(): Promise<void> {
  return new Promise((resolve) => {
    isAnimating = true
    const tl = gsap.timeline({
      onComplete: () => {
        isVisible.value = false
        isAnimating = false
        resolve()
      },
    })
    tl.to(panelRef.value!, { x: "100%", duration: 0.22, ease: "power3.in" }, 0)
    tl.to(backdropRef.value!, { opacity: 0, duration: 0.15, ease: "power2.in" }, 0)
  })
}

async function handleClose() {
  await animateOut()
  emit("close")
}

watch(() => props.open, async (val) => {
  if (val && !isVisible.value && !isAnimating) {
    isVisible.value = true
    await nextTick()
    animateIn()
  } else if (!val && isVisible.value && !isAnimating) {
    await animateOut()
  }
})

onMounted(async () => {
  if (props.open) {
    isVisible.value = true
    await nextTick()
    animateIn()
  }
})
</script>

<template>
  <div v-if="isVisible" ref="overlayRef" class="fixed inset-0 z-40 flex justify-end">
    <!-- 遮罩 -->
    <div ref="backdropRef" style="opacity:0" class="absolute inset-0 bg-black/20" @click="handleClose" />
    <!-- 抽屉面板 -->
    <div ref="panelRef" style="transform:translateX(100%)" class="relative w-72 bg-white border-l border-neutral-200 shadow-lg flex flex-col overflow-hidden">
      <div class="px-4 h-11 flex items-center justify-between border-b border-neutral-100 shrink-0">
        <span class="text-sm font-semibold text-neutral-800">
          <slot name="title">历史记录</slot>
        </span>
        <button class="text-neutral-400 hover:text-neutral-600 transition" @click="handleClose">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="flex-1 min-h-0 overflow-auto">
        <slot />
      </div>
    </div>
  </div>
</template>
