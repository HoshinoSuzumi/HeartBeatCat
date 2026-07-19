<script lang="ts" setup>
import { computed, ref } from "vue"
import HeartRateChart from "../components/HeartRateChart.vue"
import { useHeartRateHistoryStore } from "../stores/heartRateHistory"
import { useHistoryDrawer } from "../composables/useDrawer"

const store = useHeartRateHistoryStore()
const historyDrawer = useHistoryDrawer()

// ── 时间范围 ──
const TIME_RANGES = [
  { label: "1分钟", value: 60 },
  { label: "5分钟", value: 300 },
  { label: "15分钟", value: 900 },
] as const

const selectedRange = ref(300)
const visibleData = computed(() => store.getPointsInRange(selectedRange.value))

const rangeStats = computed(() => {
  const pts = visibleData.value
  if (pts.length === 0) return { avg: 0, min: 0, max: 0, latest: 0 }
  const vals = pts.map((p) => p.value)
  return {
    avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    min: Math.min(...vals),
    max: Math.max(...vals),
    latest: vals[vals.length - 1],
  }
})

const hasData = computed(() => store.points.length > 0)
</script>

<template>
  <PageContainer title="心率记录">
    <template #actions>
      <button
        class="text-xs font-medium text-primary-500 hover:text-primary-600 transition"
        @click="historyDrawer.open()"
      >
        历史记录
      </button>
    </template>

    <div class="w-full h-full flex flex-col bg-white">
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
          :data="store.points"
          :time-range="selectedRange"
        />
      </div>

      <!-- 时间范围切换 -->
      <div class="px-4 pb-3 flex justify-center gap-1.5">
        <button
          v-for="r in TIME_RANGES"
          :key="r.value"
          class="px-4 py-1.5 text-xs rounded-full transition font-medium"
          :class="
            selectedRange === r.value
              ? 'bg-primary-500 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100'
          "
          @click="selectedRange = r.value"
        >
          {{ r.label }}
        </button>
      </div>
    </div>
  </PageContainer>
</template>
