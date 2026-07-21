# 002 — 心率曲线图表架构

**日期**: 2026-07-19

**状态**: 已通过

## 背景

心率实时曲线是 HeartbeatCat 的核心功能模块之一，需要在设备连接后以可视化方式展示心率变化趋势。同时，该曲线数据需要能被插件系统消费（Widget 插件和 Streaming 推流插件）。

## 决定

1. **Canvas 2D 自绘**：不引入第三方图表库（如 ECharts、Chart.js），使用原生 Canvas 2D API 手写渲染逻辑。
2. **环形缓冲区**：Pinia store `heartRateHistory` 维护一个环形缓冲区，默认容量 900 点（15 分钟 @ 1Hz），可通过 `setMaxPoints()` 调整，上限 3600 点（1 小时）。
3. **数据采集**：Store 通过轮询 `useHrcatStore().current_heart_rate` 自动采集，不依赖页面挂载。
4. **插件兼容**：Store 的 `points` 和 `getPointsInRange()` 作为数据暴露接口；Widget 插件可直接 `useHeartRateHistoryStore()`；Streaming 插件的 SSE 推送需后续在 Rust 后端增加缓冲区支持。

## 原因

- **Canvas > SVG/ECharts**：心率数据每秒 1 次更新，Canvas 直接操作像素，无 DOM 开销；且避免引入额外依赖、保持包体积小。
- **环形缓冲区**：内存可控（900 点 ~14KB），支持配置容量以适应不同场景；用 `slice(-n)` 实现简单可靠，900 量级下 O(n) 偏移可忽略。
- **独立 Store**：与 `useHrcatStore`（设备连接管理）职责分离，便于插件直接引用而不引入设备管理的副作用。

## 影响

- 正面：高性能曲线渲染，零额外依赖，插件可直接消费历史数据
- 负面：Canvas 手绘没有无障碍支持（屏幕阅读器无法识别图表内容）
- 后续：需要在 Rust 后端维护心率数据缓冲区以支持 Streaming 插件的 SSE 推送

## 备选方案

| 方案 | 拒绝原因 |
|---|---|
| SVG + `<path>` | 每秒重绘导致 DOM 频繁更新，900 个 `<polyline>` 点性能差 |
| ECharts | 引入 ~1MB 依赖，功能过剩，样式定制受限 |
| Chart.js | 同样引入额外依赖，Canvas 自绘更轻量灵活 |
| 数据采集放在 `useHrcatStore` 中 | 职责混乱，插件获取历史数据时被迫依赖设备管理逻辑 |
