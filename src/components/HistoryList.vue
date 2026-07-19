<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useSessionStore, type SessionMeta } from "../stores/session"
import { useOverlay } from "../composables/useOverlay"

const sessionStore = useSessionStore()
const overlay = useOverlay()
const loading = ref(true)

onMounted(async () => {
  await sessionStore.refreshSessions()
  loading.value = false
})

function formatDuration(meta: SessionMeta): string {
  const end = meta.endedAt ?? Date.now()
  const m = Math.floor((end - meta.startedAt) / 60000)
  if (m < 60) return `${m} 分钟`
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分钟`
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function openSession(id: string) {
  overlay.openSession(id)
}
</script>

<template>
  <div v-if="loading" class="flex-1 flex justify-center items-center">
    <SvgSpinnersPulse2 class="icon text-2xl text-neutral-300" />
  </div>

  <div
    v-else-if="sessionStore.sessions.length === 0"
    class="flex-1 flex justify-center items-center"
  >
    <span class="text-xs text-neutral-400">还没有心率记录</span>
  </div>

  <div v-else class="flex-1 overflow-auto">
    <div
      v-for="s in sessionStore.sessions"
      :key="s.id"
      class="mx-3 my-1.5 p-2.5 rounded-lg border border-neutral-100 hover:bg-neutral-50 cursor-pointer transition active:scale-[0.98]"
      @click="openSession(s.id)"
    >
      <div class="flex justify-between items-center">
        <span class="text-xs font-semibold text-neutral-800">{{ formatDate(s.startedAt) }}</span>
        <span class="text-2xs text-neutral-400">{{ formatDuration(s) }}</span>
      </div>
      <div class="flex items-center gap-2 mt-1">
        <span class="text-2xs text-neutral-400">{{ s.pointCount }} 个数据点</span>
        <span
          v-if="!s.endedAt"
          class="px-1 py-0.5 rounded text-2xs bg-emerald-100 text-emerald-600 font-medium"
        >
          进行中
        </span>
      </div>
    </div>
  </div>
</template>
