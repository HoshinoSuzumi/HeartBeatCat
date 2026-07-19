<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

export interface Tip {
  title: string
  content: string
}

const props = withDefaults(defineProps<{
  tips: Tip[]
  interval?: number
}>(), {
  interval: 6000,
})

const currentIndex = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const next = () => {
  currentIndex.value = (currentIndex.value + 1) % props.tips.length
}

const goto = (idx: number) => {
  currentIndex.value = idx
}

onMounted(() => {
  if (props.tips.length > 1) {
    timer = setInterval(next, props.interval)
  }
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function resetTimer() {
  if (timer) clearInterval(timer)
  if (props.tips.length > 1) {
    timer = setInterval(next, props.interval)
  }
}
</script>

<template>
  <div v-if="tips.length > 0" class="flex flex-col gap-1.5">
    <Transition name="tip-fade" mode="out-in">
      <div :key="currentIndex"
        class="p-2.5 rounded-lg border border-neutral-100 bg-white">
        <p class="text-xs font-semibold text-neutral-700">{{ tips[currentIndex].title }}</p>
        <p class="text-2xs text-neutral-500 mt-0.5 leading-relaxed">{{ tips[currentIndex].content }}</p>
      </div>
    </Transition>
    <div v-if="tips.length > 1" class="flex items-center justify-center gap-1.5">
      <button v-for="(_, idx) in tips" :key="idx" @click="goto(idx); resetTimer()"
        class="w-1 h-1 rounded-full transition"
        :class="idx === currentIndex ? 'bg-primary-400 w-2.5' : 'bg-neutral-300'" />
    </div>
  </div>
</template>

<style scoped>
.tip-fade-enter-active,
.tip-fade-leave-active {
  transition: opacity 0.12s ease;
}
.tip-fade-enter-from,
.tip-fade-leave-to {
  opacity: 0;
}
</style>

