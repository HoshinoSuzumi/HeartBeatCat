<script lang="ts" setup>
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import FullscreenPage from "../components/FullscreenPage.vue"
import HeartRateChart from "../components/HeartRateChart.vue"
import { useSessionStore, type SessionData } from "../stores/session"

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
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
  if (pts.length === 0) return { avg: 0, min: 0, max: 0, latest: 0 }
  const vals = pts.map((p) => p.value).filter((v) => v > 0)
  if (vals.length === 0) return { avg: 0, min: 0, max: 0, latest: 0 }
  return {
    avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    min: Math.min(...vals),
    max: Math.max(...vals),
    latest: vals[vals.length - 1],
  }
})

function formatDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function handleClose() {
  router.back()
}

onMounted(async () => {
  const id = route.params.id as string
  sessionData.value = await sessionStore.loadSession(id)
  loading.value = false
})
</script>

<template>
  <FullscreenPage @close="handleClose">
    <template #title>会话详情</template>
    <template v-if="sessionData" #subtitle>{{ formatDate(sessionData.meta.startedAt) }}</template>

    <div v-if="loading" class="h-full flex justify-center items-center">
      <SvgSpinnersPulse2 class="icon text-3xl text-neutral-300" />
    </div>
    <div v-else-if="!sessionData" class="h-full flex justify-center items-center">
      <span class="text-sm font-semibold text-neutral-400">会话数据不存在</span>
    </div>
    <div v-else class="h-full flex flex-col">
      <!-- 统计概览 -->
      <div class="px-5 py-3 flex items-center gap-6 border-b border-neutral-100">
        <div class="flex items-baseline gap-1">
          <span
            class="text-4xl font-bold tabular-nums"
            :class="hasData ? 'text-primary-500' : 'text-neutral-300'"
          >
            {{ rangeStats.latest || "--" }}
          </span>
          <span class="text-xs text-neutral-400 font-medium">BPM</span>
        </div>
        <div class="flex gap-4 text-xs">
          <div class="flex flex-col items-center">
            <span class="text-neutral-400">平均</span>
            <span class="font-semibold tabular-nums text-neutral-700">{{ rangeStats.avg || "--" }}</span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-neutral-400">最低</span>
            <span class="font-semibold tabular-nums text-neutral-700">{{ rangeStats.min || "--" }}</span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-neutral-400">最高</span>
            <span class="font-semibold tabular-nums text-neutral-700">{{ rangeStats.max || "--" }}</span>
          </div>
        </div>
      </div>

      <!-- 图表 -->
      <div class="flex-1 min-h-0">
        <HeartRateChart
          :data="sessionData.points"
          :time-range="dataSpanSeconds"
          :config="{ yMin: 0 }"
          historical
        />
      </div>
    </div>
  </FullscreenPage>
</template>

<style scoped></style>
