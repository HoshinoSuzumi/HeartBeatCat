<script lang="ts" setup>
import { computed, ref, watch, nextTick } from 'vue'
import gsap from 'gsap'
import { useConfirmDialog } from '../composables/useConfirmDialog'

const { state } = useConfirmDialog()

const backdropRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const domVisible = ref(false)

let activeTl: gsap.core.Timeline | null = null

watch(() => state.visible, async (v) => {
  if (activeTl) { activeTl.kill(); activeTl = null }

  if (v) {
    domVisible.value = true
    await nextTick()
    const tl = gsap.timeline()
    tl.fromTo(backdropRef.value!, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' }, 0)
    tl.fromTo(panelRef.value!, { scale: 0.5, opacity: 0 }, {
      scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(1.7)',
    }, 0.05)
    activeTl = tl
  } else {
    if (!backdropRef.value) { domVisible.value = false; return }
    const tl = gsap.timeline({
      onComplete: () => { domVisible.value = false; activeTl = null },
    })
    tl.to(panelRef.value!, { scale: 0.85, opacity: 0, duration: 0.2, ease: 'power2.in' }, 0)
    tl.to(backdropRef.value!, { opacity: 0, duration: 0.25, ease: 'power2.in' }, 0)
    activeTl = tl
  }
})

const confirmBtnClass = computed(() => {
  switch (state.type) {
    case 'danger':
      return 'bg-red-500 hover:bg-red-600 text-white border-red-500'
    case 'warning':
      return 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500'
    default:
      return 'bg-primary-500 hover:bg-primary-600 text-white'
  }
})

const iconColor = computed(() => {
  switch (state.type) {
    case 'danger': return 'text-red-500'
    case 'warning': return 'text-amber-500'
    default: return 'text-primary-500'
  }
})

const onConfirm = () => {
  state.resolve?.(true)
  state.visible = false
}

const onCancel = () => {
  state.resolve?.(false)
  state.visible = false
}

const onBackdrop = () => {
  onCancel()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="domVisible"
      ref="backdropRef"
      class="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      @click.self="onBackdrop"
    >
      <div ref="panelRef" class="bg-white rounded-lg shadow-xl p-6 w-80">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg" :class="iconColor">
            <svg v-if="state.type === 'warning' || state.type === 'danger'" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          </span>
          <h3 class="text-sm font-semibold">{{ state.title }}</h3>
        </div>
        <p class="text-xs text-neutral-500 mb-4 leading-relaxed">{{ state.message }}</p>
        <div class="flex justify-end gap-2">
          <button class="btn outline text-xs" @click="onCancel">{{ state.cancelText }}</button>
          <button
            class="btn text-xs"
            :class="confirmBtnClass"
            @click="onConfirm"
          >{{ state.confirmText }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
