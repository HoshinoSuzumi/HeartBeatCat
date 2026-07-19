<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue"
import FullscreenPage from "./FullscreenPage.vue"
import HeartRateChart from "./HeartRateChart.vue"
import { useSessionStore, type SessionData } from "../stores/session"
import { useConfirmDialog } from "../composables/useConfirmDialog"

const props = defineProps<{ sessionId: string }>()
const emit = defineEmits<{ close: [] }>()

const sessionStore = useSessionStore()
const confirmDialog = useConfirmDialog()
const sessionData = ref<SessionData | null>(null)
const loading = ref(true)

const hasData = computed(() => (sessionData.value?.points.length ?? 0) > 0)

const dataSpanSeconds = computed(() => {
  const pts = sessionData.value?.points
  if (!pts || pts.length < 2) return 60
  return Math.ceil((pts[pts.length - 1].timestamp - pts[0].timestamp) / 1000)
})

const rangeStats = computed(() => {
  const pts = sessionData.value?.points ?? []
  if (pts.length === 0) return { avg: 0, min: 0, max: 0 }
  const vals = pts.map((p) => p.value).filter((v) => v > 0)
  if (vals.length === 0) return { avg: 0, min: 0, max: 0 }
  return {
    avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    min: Math.min(...vals),
    max: Math.max(...vals),
  }
})

function formatDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m} 分钟`
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分钟`
}

const subtitle = computed(() => {
  const meta = sessionData.value?.meta
  if (!meta) return ""
  let text = formatDate(meta.startedAt)
  if (meta.endedAt) {
    text += ` → ${formatDate(meta.endedAt)} · ${formatDuration(meta.endedAt - meta.startedAt)}`
  }
  return text
})

async function load(id: string) {
  loading.value = true
  sessionData.value = await sessionStore.loadSession(id)
  loading.value = false
}

onMounted(() => load(props.sessionId))
watch(() => props.sessionId, (id) => load(id))

async function handleDelete() {
  const confirmed = await confirmDialog.confirm({
    title: "删除会话",
    message: "确认删除此会话记录？此操作不可撤销。",
    type: "danger",
    confirmText: "删除",
    cancelText: "取消",
  })
  if (!confirmed) return
  await sessionStore.deleteSession(props.sessionId)
  emit("close")
}
</script>

<template>
  <FullscreenPage @close="$emit('close')">
    <template #title>会话详情</template>
    <template v-if="sessionData" #subtitle>{{ subtitle }}</template>
    <template v-if="sessionData" #actions>
      <button
        class="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium text-red-500 hover:bg-red-50 transition"
        @click="handleDelete"
      >
        <TablerTrash class="text-sm" />
        删除
      </button>
    </template>

    <div v-if="loading" class="h-full flex justify-center items-center">
      <SvgSpinnersPulse2 class="icon text-3xl text-neutral-300" />
    </div>
    <div v-else-if="!sessionData" class="h-full flex justify-center items-center">
      <span class="text-sm font-semibold text-neutral-400">会话数据不存在</span>
    </div>
    <div v-else class="h-full flex flex-col">
      <div class="px-5 py-3 flex items-center gap-6 border-b border-neutral-100">
        <div class="flex items-baseline gap-1">
          <span
            class="text-4xl font-bold tabular-nums"
            :class="hasData ? 'text-primary-500' : 'text-neutral-300'"
          >
            {{ rangeStats.avg || "--" }}
          </span>
          <span class="text-xs text-neutral-400 font-medium">平均 BPM</span>
        </div>
        <div class="flex gap-4 text-xs">
          <div class="flex flex-col items-center">
            <span class="text-neutral-400">最高</span>
            <span class="font-semibold tabular-nums text-neutral-700">{{ rangeStats.max || "--" }}</span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-neutral-400">最低</span>
            <span class="font-semibold tabular-nums text-neutral-700">{{ rangeStats.min || "--" }}</span>
          </div>
        </div>
      </div>

      <div class="flex-1 min-h-0">
        <HeartRateChart
          v-if="sessionData"
          :data="sessionData.points"
          :time-range="dataSpanSeconds"
          :config="{ yMin: 0 }"
          historical
        />
      </div>
    </div>
  </FullscreenPage>
</template>
