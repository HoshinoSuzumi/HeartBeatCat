import { BaseDirectory, exists, mkdir, readDir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs"
import { defineStore } from "pinia"
import { ref } from "vue"
import type { HeartRatePoint } from "./heartRateHistory"
import { useHeartRateHistoryStore } from "./heartRateHistory"

// ── 类型 ──
export interface SessionMeta {
  id: string
  startedAt: number
  endedAt: number | null
  pointCount: number
}

export interface SessionData {
  meta: SessionMeta
  points: HeartRatePoint[]
}

/** 生成会话 ID：ISO 时间戳，文件系统安全 */
function makeSessionId(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

const SESSIONS_DIR = "sessions"
const FLUSH_INTERVAL = 5000

export const useSessionStore = defineStore("session", () => {
  const sessions = ref<SessionMeta[]>([])
  const currentSession = ref<SessionMeta | null>(null)

  // ── 持久化写入 ──
  let lastFlushedTs = 0
  let flushTimer: ReturnType<typeof setInterval> | null = null

  const _sessionPath = (id: string) => `${SESSIONS_DIR}/${id}.json`

  const _ensureDir = async () => {
    if (!(await exists(SESSIONS_DIR, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(SESSIONS_DIR, { baseDir: BaseDirectory.AppData, recursive: true })
    }
  }

  const _writeSession = async (data: SessionData) => {
    await _ensureDir()
    await writeTextFile(_sessionPath(data.meta.id), JSON.stringify(data), {
      baseDir: BaseDirectory.AppData,
    })
  }

  const _readSession = async (id: string): Promise<SessionData | null> => {
    const p = _sessionPath(id)
    if (!(await exists(p, { baseDir: BaseDirectory.AppData }))) return null
    try {
      const raw = await readTextFile(p, { baseDir: BaseDirectory.AppData })
      return JSON.parse(raw) as SessionData
    } catch {
      return null
    }
  }

  // ── 会话生命周期 ──
  const startSession = async () => {
    const now = Date.now()
    lastFlushedTs = now
    const id = makeSessionId(now)
    const meta: SessionMeta = { id, startedAt: now, endedAt: null, pointCount: 0 }
    currentSession.value = meta

    // 启动心率数据采集 + 清空上一会话的旧数据
    const hrStore = useHeartRateHistoryStore()
    hrStore.clear()
    hrStore.ensureCollecting()

    try {
      await _writeSession({ meta, points: [] })
      console.log("[Session] 会话已创建:", id)
    } catch (e) {
      console.error("[Session] 创建会话文件失败:", e)
      currentSession.value = null
      return
    }

    // 定期刷盘：从心率 history store 拉取新数据点
    flushTimer = setInterval(() => {
      _flush().catch((e) => console.error("[Session] 刷盘失败:", e))
    }, FLUSH_INTERVAL)
  }

  const _flush = async () => {
    if (!currentSession.value) return
    const hrStore = useHeartRateHistoryStore()
    const newPoints = hrStore.points.filter((p) => p.timestamp > lastFlushedTs)
    if (newPoints.length === 0) return

    const existing = await _readSession(currentSession.value.id)
    if (!existing) {
      console.error("[Session] 无法读取会话文件:", currentSession.value.id)
      return
    }

    existing.points.push(...newPoints)
    existing.meta.pointCount = existing.points.length
    currentSession.value.pointCount = existing.meta.pointCount

    lastFlushedTs = newPoints[newPoints.length - 1].timestamp
    await _writeSession(existing)
    console.log(`[Session] 已写入 ${newPoints.length} 个数据点 (总计 ${existing.points.length})`)
  }

  const endSession = async () => {
    if (flushTimer) {
      clearInterval(flushTimer)
      flushTimer = null
    }
    try {
      await _flush()
      if (currentSession.value) {
        currentSession.value.endedAt = Date.now()
        const data = await _readSession(currentSession.value.id)
        if (data) {
          data.meta.endedAt = currentSession.value.endedAt
          await _writeSession(data)
        }
        currentSession.value = null
      }
    } catch (e) {
      console.error("[Session] 关闭会话失败:", e)
    }
    const hrStore = useHeartRateHistoryStore()
    hrStore.stopCollecting()
    hrStore.clear()
    await refreshSessions()
  }

  // ── 查询 ──
  const refreshSessions = async () => {
    await _ensureDir()
    const entries = await readDir(SESSIONS_DIR, { baseDir: BaseDirectory.AppData })
    const result: SessionMeta[] = []

    for (const entry of entries) {
      if (!entry.name?.endsWith(".json")) continue
      const id = entry.name.replace(".json", "")
      const data = await _readSession(id)
      if (data) {
        result.push(data.meta)
      }
    }

    result.sort((a, b) => b.startedAt - a.startedAt)
    sessions.value = result
  }

  const loadSession = async (id: string): Promise<SessionData | null> => {
    return _readSession(id)
  }

  const deleteSession = async (id: string) => {
    const p = _sessionPath(id)
    if (await exists(p, { baseDir: BaseDirectory.AppData })) {
      await remove(p, { baseDir: BaseDirectory.AppData })
    }
    sessions.value = sessions.value.filter((s) => s.id !== id)
  }

  const isActive = () => currentSession.value !== null

  return {
    sessions,
    currentSession,
    startSession,
    endSession,
    refreshSessions,
    loadSession,
    deleteSession,
    isActive,
  }
})
