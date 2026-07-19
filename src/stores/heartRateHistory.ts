import { listen } from "@tauri-apps/api/event"
import { defineStore } from "pinia"
import { computed, ref } from "vue"

export interface HeartRatePoint {
  timestamp: number
  value: number
}

/** 环形缓冲区默认容量：15 分钟 @ 1Hz */
const DEFAULT_MAX_POINTS = 900

export const useHeartRateHistoryStore = defineStore("heartRateHistory", () => {
  const points = ref<HeartRatePoint[]>([])
  const maxPoints = ref(DEFAULT_MAX_POINTS)

  // ── 自动从 Tauri 事件采集心率数据 ──
  let unlisten: (() => void) | null = null
  let lastPushTime = 0

  const ensureCollecting = () => {
    if (unlisten) return
    listen("heart-rate", (event) => {
      const hr = event.payload as number
      if (!hr || hr <= 0) return
      const now = Date.now()

      // 距离上次采样超过 2 秒 → 插入 0 值标记断连
      if (lastPushTime > 0 && now - lastPushTime > 2000) {
        pushGap(0, lastPushTime + 1000)
      }

      push(hr, now)
      lastPushTime = now
    }).then((fn) => {
      unlisten = fn
    })
  }

  const stopCollecting = () => {
    unlisten?.()
    unlisten = null
  }

  // ── 环形缓冲区写入 ──
  const push = (value: number, ts?: number) => {
    const now = ts ?? Date.now()
    points.value = [...points.value, { timestamp: now, value }].slice(-maxPoints.value)
  }

  /** 插入指定时间戳的数据点（用于断连 0 值标记） */
  const pushGap = (value: number, ts: number) => {
    push(value, ts)
  }

  // ── 按时间窗口查询 ──
  const getPointsInRange = (seconds: number): HeartRatePoint[] => {
    const cutoff = Date.now() - seconds * 1000
    return points.value.filter((p) => p.timestamp >= cutoff)
  }

  // ── 清空数据 ──
  const clear = () => {
    points.value = []
  }

  // ── 统计信息 ──
  const stats = computed(() => {
    const vals = points.value.map((p) => p.value)
    if (vals.length === 0) return { avg: 0, min: 0, max: 0, latest: 0 }
    const sum = vals.reduce((a, b) => a + b, 0)
    return {
      avg: Math.round(sum / vals.length),
      min: Math.min(...vals),
      max: Math.max(...vals),
      latest: vals[vals.length - 1],
    }
  })

  // ── 设置缓冲区容量 ──
  const setMaxPoints = (n: number) => {
    maxPoints.value = Math.max(10, Math.min(n, 3600))
    points.value = points.value.slice(-maxPoints.value)
  }

  return {
    points,
    maxPoints,
    push,
    getPointsInRange,
    clear,
    stats,
    setMaxPoints,
    ensureCollecting,
    stopCollecting,
  }
})
