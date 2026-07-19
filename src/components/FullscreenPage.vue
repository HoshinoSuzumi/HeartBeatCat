<script setup lang="ts">
import gsap from "gsap"
import { onMounted, ref } from "vue"
import { onBeforeRouteLeave } from "vue-router"

const emit = defineEmits<{
  close: []
}>()

const overlayRef = ref<HTMLElement>()
const backdropRef = ref<HTMLElement>()
const panelRef = ref<HTMLElement>()

// ── 进入动画：遮罩淡入 + 面板从底部滑入 ──
onMounted(() => {
  const tl = gsap.timeline()
  tl.fromTo(backdropRef.value, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" }, 0)
  tl.fromTo(panelRef.value, { y: "100%" }, { y: "0%", duration: 0.32, ease: "power3.out" }, 0)
})

// ── 退出动画：遮罩淡出 + 面板滑回底部 ──
function animateOut(): Promise<void> {
  return new Promise((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve })
    tl.to(panelRef.value, { y: "100%", duration: 0.25, ease: "power3.in" }, 0)
    tl.to(backdropRef.value, { opacity: 0, duration: 0.2, ease: "power2.in" }, 0.05)
  })
}

async function handleClose() {
  await animateOut()
  emit("close")
}

onBeforeRouteLeave(async (_to, _from, next) => {
  await animateOut()
  next()
})
</script>

<template>
  <div ref="overlayRef" class="fixed inset-0 z-50">
    <!-- 半透明遮罩 -->
    <div ref="backdropRef" style="opacity:0" class="absolute inset-0 bg-black/30" @click="handleClose" />
    <!-- 内容面板：绝对定位，从底部滑入 -->
    <div ref="panelRef" style="transform:translateY(100%)" class="absolute inset-0 bg-white flex flex-col">
      <header
        class="h-11 px-4 flex items-center gap-3 bg-gradient-to-r from-primary-50 to-primary-100 border-b shrink-0"
      >
        <button
          class="flex items-center justify-center w-7 h-7 rounded hover:bg-black/5 transition"
          @click="handleClose"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-4 h-4 text-neutral-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          ><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <div class="flex flex-col gap-0.5">
          <span class="text-sm font-semibold text-neutral-800">
            <slot name="title" />
          </span>
          <span v-if="$slots.subtitle" class="text-2xs text-neutral-500">
            <slot name="subtitle" />
          </span>
        </div>
        <div class="flex-1" />
        <slot name="actions" />
      </header>
      <div class="flex-1 min-h-0">
        <slot />
      </div>
    </div>
  </div>
</template>
