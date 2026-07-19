<script setup lang="ts">
import gsap from "gsap"
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue"
import type { HeartRatePoint } from "../stores/heartRateHistory"

// ── 图表配置 ──
export interface HeartRateChartConfig {
  /** 曲线颜色 */
  lineColor?: string
  /** 曲线下方渐变起始色 */
  fillStartColor?: string
  /** 图线宽度 */
  lineWidth?: number
  /** 网格线颜色 */
  gridColor?: string
  /** Y 轴文字颜色 */
  labelColor?: string
  /** Y 轴最小值 */
  yMin?: number
  /** Y 轴最大值 */
  yMax?: number
  /** 内边距 */
  padding?: number
  /** 是否显示网格 */
  showGrid?: boolean
  /** 是否显示 Y 轴标签 */
  showLabels?: boolean
}

const props = withDefaults(
  defineProps<{
    data: HeartRatePoint[]
    timeRange: number
    config?: HeartRateChartConfig
    /** 历史模式：固定时间轴，绝对时间标签 */
    historical?: boolean
  }>(),
  {
    timeRange: 300,
  },
)

const cfg = computed<Required<HeartRateChartConfig>>(() => ({
  lineColor: props.config?.lineColor ?? "#fa3a7b",
  fillStartColor: props.config?.fillStartColor ?? "rgba(250,58,123,0.18)",
  lineWidth: props.config?.lineWidth ?? 2,
  gridColor: props.config?.gridColor ?? "rgba(0,0,0,0.06)",
  labelColor: props.config?.labelColor ?? "#a3a3a3",
  yMin: props.config?.yMin ?? 0,
  yMax: props.config?.yMax ?? 200,
  padding: props.config?.padding ?? 36,
  showGrid: props.config?.showGrid ?? true,
  showLabels: props.config?.showLabels ?? true,
}))

// ── Canvas 引用 ──
const canvasRef = ref<HTMLCanvasElement | null>(null)
let resizeObserver: ResizeObserver | null = null
let animFrameId: number | null = null
let continuousDraw = false

// ── Tooltip 状态 ──
interface TooltipData {
  x: number
  y: number
  bpm: number
  timeText: string
}
const tooltip = shallowRef<TooltipData | null>(null)
const tooltipOpacity = { value: 0 }
let tooltipTween: gsap.core.Tween | null = null

/** 格式化相对时间 */
function formatRelativeTime(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}秒前`
  if (s < 3600) return `${Math.floor(s / 60)}分${s % 60}秒前`
  return `${Math.floor(s / 3600)}小时前`
}

/** 格式化绝对时间 */
function formatAbsoluteTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 在可见数据点中找离鼠标 x 最近的点 */
function findNearest(
  pts: HeartRatePoint[],
  toX: (ts: number) => number,
  toY: (val: number) => number,
  mouseX: number,
  historical: boolean,
): TooltipData | null {
  if (pts.length === 0) return null
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < pts.length; i++) {
    const dist = Math.abs(toX(pts[i].timestamp) - mouseX)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }
  if (bestDist > 30) return null
  const p = pts[bestIdx]
  return {
    x: toX(p.timestamp),
    y: toY(p.value),
    bpm: p.value,
    timeText: historical
      ? formatAbsoluteTime(p.timestamp)
      : formatRelativeTime(Date.now() - p.timestamp),
  }
}

// 数据、时间范围或配置变化时重绘
watch(
  [() => props.data, () => props.timeRange, cfg],
  () => requestDraw(),
)
const draw = () => {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext("2d")
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  const w = rect.width
  const h = rect.height

  // 高 DPI 缩放
  canvas.width = w * dpr
  canvas.height = h * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  ctx.clearRect(0, 0, w, h)

  const pad = cfg.value.padding
  const chartW = w - pad * 2
  const chartH = h - pad * 2

  if (chartW <= 0 || chartH <= 0) return

  // 与坐标映射共用同一个 now，避免边界点溢出
  const now = Date.now()
  let pts: HeartRatePoint[]
  if (props.historical) {
    pts = props.data
  } else {
    const cutoff = now - props.timeRange * 1000
    pts = props.data.filter((p) => p.timestamp >= cutoff)
  }

  if (pts.length === 0) {
    drawEmptyState(ctx, w, h)
    return
  }

  const yMin = cfg.value.yMin
  const yMax = cfg.value.yMax
  const yRange = yMax - yMin

  // ── 坐标映射 ──
  let rangeMs: number
  let startMs: number
  if (props.historical && pts.length > 0) {
    const firstTs = pts[0].timestamp
    const lastTs = pts[pts.length - 1].timestamp
    rangeMs = lastTs - firstTs || 60000
    startMs = firstTs
  } else {
    rangeMs = props.timeRange * 1000
    startMs = now - rangeMs
  }

  const toX = (ts: number) => pad + ((ts - startMs) / rangeMs) * chartW
  const toY = (val: number) => pad + chartH - ((val - yMin) / yRange) * chartH

  // 暂存坐标映射供鼠标事件使用
  toX_fromDraw.fn = toX
  toY_fromDraw.fn = toY
  lastVisiblePts = pts

  // ── 绘制网格 ──
  if (cfg.value.showGrid) {
    drawGrid(ctx, w, h, pad, chartW, chartH, pts, toX, toY, yMin, yMax, props.historical ?? false)
  }

  // ── 裁剪区域 ──
  ctx.save()
  ctx.beginPath()
  ctx.rect(pad, 0, chartW, h)
  ctx.clip()

  // ── 绘制曲线 ──
  drawSmoothCurve(ctx, pts, toX, toY, yMin, yMax, pad, chartH)

  ctx.restore()

  // ── 绘制 tooltip（不受裁剪区域限制） ──
  if (tooltipOpacity.value > 0.001 && tooltip.value) {
    drawTooltip(ctx, tooltip.value, chartW, chartH, pad)
  }
}

// ── 平滑曲线 + 渐变填充（0 值灰线、非 0 主色线分片绘制） ──
const drawSmoothCurve = (
  ctx: CanvasRenderingContext2D,
  pts: HeartRatePoint[],
  toX: (ts: number) => number,
  toY: (val: number) => number,
  _yMin: number,
  _yMax: number,
  p: number,
  chartH: number,
) => {
  if (pts.length === 0) return

  // 按值是否为 0 拆分为连续段
  interface Seg { start: number; end: number; isZero: boolean }
  const segments: Seg[] = []
  let segStart = 0
  for (let i = 1; i <= pts.length; i++) {
    const prevZero = pts[i - 1].value === 0
    const curZero = i < pts.length ? pts[i].value === 0 : !prevZero
    if (i === pts.length || prevZero !== curZero) {
      segments.push({ start: segStart, end: i, isZero: prevZero })
      segStart = i
    }
  }

  for (const seg of segments) {
    const segPts = pts.slice(seg.start, seg.end)
    if (segPts.length === 0) continue

    if (seg.isZero) {
      drawSegment(ctx, segPts, toX, toY, p, chartH, {
        lineColor: "#d4d4d4",
        lineWidth: 1.5,
        dashed: true,
        showFill: false,
      })
    } else {
      drawSegment(ctx, segPts, toX, toY, p, chartH, {
        lineColor: cfg.value.lineColor,
        lineWidth: cfg.value.lineWidth,
        dashed: false,
        showFill: segPts.length >= 2,
      })
    }
  }

  // 最新非 0 数据点高亮
  let latestNonZero = -1
  for (let i = pts.length - 1; i >= 0; i--) {
    if (pts[i].value > 0) { latestNonZero = i; break }
  }
  if (latestNonZero >= 0) {
    const lp = pts[latestNonZero]
    const lx = toX(lp.timestamp)
    const ly = toY(lp.value)
    ctx.beginPath()
    ctx.arc(lx, ly, 5, 0, Math.PI * 2)
    ctx.fillStyle = cfg.value.lineColor
    ctx.fill()
    ctx.strokeStyle = "#fff"
    ctx.lineWidth = 2
    ctx.stroke()
  }
}

// ── 单段绘制 ──
interface SegStyle {
  lineColor: string
  lineWidth: number
  dashed: boolean
  showFill: boolean
}

const drawSegment = (
  ctx: CanvasRenderingContext2D,
  pts: HeartRatePoint[],
  toX: (ts: number) => number,
  toY: (val: number) => number,
  p: number,
  chartH: number,
  style: SegStyle,
) => {
  if (pts.length === 0) return

  const baselineY = p + chartH

  // 单点：圆
  if (pts.length === 1) {
    const x = toX(pts[0].timestamp)
    const y = toY(pts[0].value)
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fillStyle = style.lineColor
    ctx.fill()
    return
  }

  const path = new Path2D()
  path.moveTo(toX(pts[0].timestamp), toY(pts[0].value))

  // 估算正常采样间隔
  const sampleSize = Math.min(10, pts.length - 1)
  const gaps: number[] = []
  for (let i = 1; i <= sampleSize; i++) gaps.push(pts[i].timestamp - pts[i - 1].timestamp)
  gaps.sort((a, b) => a - b)
  const expectedGap = gaps[Math.floor(gaps.length / 2)] || 1000

  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1]
    const gap = p2.timestamp - p1.timestamp
    const x1 = toX(p1.timestamp), y1 = toY(p1.value)
    const x2 = toX(p2.timestamp), y2 = toY(p2.value)

    if (gap > expectedGap * 3) {
      path.lineTo(x2, y2)
      continue
    }

    const p0 = pts[Math.max(0, i - 1)]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const t = 0.3
    path.bezierCurveTo(
      x1 + (x2 - toX(p0.timestamp)) * t,
      y1 + (y2 - toY(p0.value)) * t,
      x2 - (toX(p3.timestamp) - x1) * t,
      y2 - (toY(p3.value) - y1) * t,
      x2, y2,
    )
  }

  // 填充（仅非零段）
  if (style.showFill) {
    const firstX = toX(pts[0].timestamp)
    const lastX = toX(pts[pts.length - 1].timestamp)
    const fillPath = new Path2D(path)
    fillPath.lineTo(lastX, baselineY)
    fillPath.lineTo(firstX, baselineY)
    fillPath.closePath()

    const gradient = ctx.createLinearGradient(0, p, 0, baselineY)
    gradient.addColorStop(0, cfg.value.fillStartColor)
    gradient.addColorStop(1, "rgba(250,58,123,0)")
    ctx.fillStyle = gradient
    ctx.fill(fillPath)
  }

  // 描边
  ctx.strokeStyle = style.lineColor
  ctx.lineWidth = style.lineWidth
  ctx.lineJoin = "round"
  ctx.lineCap = "round"
  if (style.dashed) ctx.setLineDash([3, 4])
  ctx.stroke(path)
  ctx.setLineDash([])
}

// ── Tooltip 渲染 ──
const drawTooltip = (
  ctx: CanvasRenderingContext2D,
  td: TooltipData,
  chartW: number,
  chartH: number,
  pad: number,
) => {
  const alpha = tooltipOpacity.value
  ctx.save()
  ctx.globalAlpha = alpha

  // 指示线（虚线）
  ctx.strokeStyle = cfg.value.lineColor
  ctx.lineWidth = 1
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.moveTo(td.x, pad)
  ctx.lineTo(td.x, pad + chartH)
  ctx.stroke()
  ctx.setLineDash([])

  // 指示点圆圈
  ctx.beginPath()
  ctx.arc(td.x, td.y, 6, 0, Math.PI * 2)
  ctx.fillStyle = cfg.value.lineColor
  ctx.fill()
  ctx.strokeStyle = "#fff"
  ctx.lineWidth = 2
  ctx.stroke()

  // ── 卡片 ──
  const cardW = 88
  const cardH = 36
  const radius = 6

  // 卡片默认放在数据点上方，必要时翻转到下方
  let cardY = td.y - cardH - 8
  if (cardY < 0) {
    cardY = td.y + 8
  }
  // 水平居中，限制在图表区域内
  let cardX = td.x - cardW / 2
  cardX = Math.max(pad, Math.min(pad + chartW - cardW, cardX))

  // 阴影
  ctx.shadowColor = "rgba(0,0,0,0.12)"
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 2

  // 圆角矩形卡片
  ctx.fillStyle = "#fff"
  ctx.beginPath()
  ctx.moveTo(cardX + radius, cardY)
  ctx.lineTo(cardX + cardW - radius, cardY)
  ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + radius)
  ctx.lineTo(cardX + cardW, cardY + cardH - radius)
  ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - radius, cardY + cardH)
  ctx.lineTo(cardX + radius, cardY + cardH)
  ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - radius)
  ctx.lineTo(cardX, cardY + radius)
  ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY)
  ctx.closePath()
  ctx.fill()

  // 清除阴影避免影响文字
  ctx.shadowColor = "transparent"
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // BPM 数值
  ctx.fillStyle = cfg.value.lineColor
  ctx.font = "bold 16px system-ui, -apple-system, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(`${td.bpm} BPM`, cardX + cardW / 2, cardY + cardH / 2 - 3)

  // 时间标签
  ctx.fillStyle = "#a3a3a3"
  ctx.font = "10px system-ui, -apple-system, sans-serif"
  ctx.fillText(td.timeText, cardX + cardW / 2, cardY + cardH / 2 + 12)

  ctx.restore()
}

// ── 网格线 + Y 轴标签 ──
const drawGrid = (
  ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number,
  p: number,
  chartW: number,
  chartH: number,
  pts: HeartRatePoint[],
  toX: (ts: number) => number,
  toY: (val: number) => number,
  yMin: number,
  yMax: number,
  historical: boolean,
) => {
  ctx.strokeStyle = cfg.value.gridColor
  ctx.lineWidth = 1
  ctx.fillStyle = cfg.value.labelColor
  ctx.font = "10px system-ui, -apple-system, sans-serif"
  ctx.textAlign = "right"

  // 水平网格线（BPM）— 不变
  const yStep = 20
  for (let bpm = yMin; bpm <= yMax; bpm += yStep) {
    const y = toY(bpm)
    ctx.beginPath()
    ctx.moveTo(p, y)
    ctx.lineTo(p + chartW, y)
    ctx.stroke()

    if (cfg.value.showLabels) {
      ctx.fillText(String(bpm), p - 6, y + 3)
    }
  }

  ctx.textAlign = "center"

  if (historical) {
    // ── 历史模式：绝对时间标签 ──
    if (pts.length === 0) return
    const firstTs = pts[0].timestamp
    const lastTs = pts[pts.length - 1].timestamp
    const spanS = (lastTs - firstTs) / 1000 || 60

    let vStep: number
    if (spanS <= 60) vStep = 10
    else if (spanS <= 300) vStep = 30
    else if (spanS <= 900) vStep = 60
    else if (spanS <= 3600) vStep = 120
    else vStep = 600

    const pad2 = (n: number) => String(n).padStart(2, "0")
    for (let ts = firstTs; ts <= lastTs; ts += vStep * 1000) {
      const x = toX(ts)
      if (x < p || x > p + chartW) continue

      ctx.beginPath()
      ctx.moveTo(x, p)
      ctx.lineTo(x, p + chartH)
      ctx.stroke()

      if (cfg.value.showLabels) {
        const d = new Date(ts)
        ctx.fillText(`${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`, x, p + chartH + 14)
      }
    }
  } else {
    // ── 实时模式：相对时间标签 ──
    const rangeS = props.timeRange
    let vStep: number
    let labelFn: (agoS: number) => string

    if (rangeS <= 60) {
      vStep = 10
      labelFn = (s) => `${s}s`
    } else if (rangeS <= 300) {
      vStep = 60
      labelFn = (s) => `${Math.round(s / 60)}m`
    } else {
      vStep = 120
      labelFn = (s) => `${Math.round(s / 60)}m`
    }

    ctx.textAlign = "center"
    const now = Date.now()
    for (let ago = 0; ago <= rangeS; ago += vStep) {
      const ts = now - ago * 1000
      const x = toX(ts)
      if (x < p || x > p + chartW) continue

      ctx.beginPath()
      ctx.moveTo(x, p)
      ctx.lineTo(x, p + chartH)
      ctx.stroke()

      if (cfg.value.showLabels && ago > 0) {
        ctx.fillText(`-${labelFn(ago)}`, x, p + chartH + 14)
      }
    }

    // "现在" 标签
    if (pts.length > 0) {
      const nowX = toX(pts[pts.length - 1].timestamp)
      ctx.fillText("现在", nowX, p + chartH + 14)
    }
  }
}

// ── 空状态 ──
const drawEmptyState = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = "#d4d4d4"
  ctx.font = "13px system-ui, -apple-system, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("等待心率数据...", w / 2, h / 2)
}

// ── 绘制调度（支持连续动画帧） ──
const requestDraw = () => {
  if (animFrameId !== null) return
  animFrameId = requestAnimationFrame(() => {
    animFrameId = null
    draw()
    if (continuousDraw) requestDraw()
  })
}

const _animateTooltip = (targetOpacity: number, duration: number) => {
  tooltipTween?.kill()
  continuousDraw = true
  tooltipTween = gsap.to(tooltipOpacity, {
    value: targetOpacity,
    duration,
    ease: targetOpacity > 0.5 ? "power2.out" : "power2.in",
    onComplete: () => {
      continuousDraw = false
      if (targetOpacity === 0) tooltip.value = null
    },
  })
  requestDraw()
}

// ── 鼠标事件 ──
const toX_fromDraw = { fn: null as ((ts: number) => number) | null }
const toY_fromDraw = { fn: null as ((val: number) => number) | null }
let lastVisiblePts: HeartRatePoint[] = []

const onMouseMove = (e: MouseEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top

  // 检查鼠标是否在图表区域内
  const pad = cfg.value.padding
  if (mx < pad || mx > rect.width - pad || my < 0 || my > rect.height) {
    // 移出图表区域 → 隐藏 tooltip
    if (tooltip.value) {
      tooltip.value = null
      _animateTooltip(0, 0.12)
    }
    return
  }

  if (!toX_fromDraw.fn || !toY_fromDraw.fn) return

  const nearest = findNearest(lastVisiblePts, toX_fromDraw.fn, toY_fromDraw.fn, mx, props.historical ?? false)
  if (nearest) {
    tooltip.value = nearest
    _animateTooltip(1, 0.18)
  } else if (tooltip.value) {
    tooltip.value = null
    _animateTooltip(0, 0.12)
  }
}

const onMouseLeave = () => {
  if (tooltip.value) {
    tooltip.value = null
    _animateTooltip(0, 0.12)
  }
}

onMounted(() => {
  draw()
  resizeObserver = new ResizeObserver(() => requestDraw())
  if (canvasRef.value) {
    resizeObserver.observe(canvasRef.value)
    canvasRef.value.addEventListener("mousemove", onMouseMove)
    canvasRef.value.addEventListener("mouseleave", onMouseLeave)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  tooltipTween?.kill()
  if (animFrameId !== null) cancelAnimationFrame(animFrameId)
  if (canvasRef.value) {
    canvasRef.value.removeEventListener("mousemove", onMouseMove)
    canvasRef.value.removeEventListener("mouseleave", onMouseLeave)
  }
})

</script>

<template>
  <canvas ref="canvasRef" class="w-full h-full block" />
</template>

<style scoped>
canvas {
  image-rendering: auto;
}
</style>
