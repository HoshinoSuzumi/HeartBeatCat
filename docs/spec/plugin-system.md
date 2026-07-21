# 插件系统规格说明

**版本**: 2.0

**状态**: 设计中

---

## 目录

- [1. 概述](#1-概述)
- [2. 插件清单（Manifest）](#2-插件清单manifest)
- [3. 插件包结构](#3-插件包结构)
- [4. 插件存储与查找](#4-插件存储与查找)
- [5. 桌面组件（Widget）](#5-桌面组件widget)
- [6. 推流插件（Streaming）](#6-推流插件streaming)
- [7. 插件安装与卸载](#7-插件安装与卸载)
- [8. 插件配置管理](#8-插件配置管理)
- [9. 插件开发框架](#9-插件开发框架)
- [10. 数据流与事件系统](#10-数据流与事件系统)
- [11. 主应用前端架构](#11-主应用前端架构)
- [12. 主应用后端架构](#12-主应用后端架构)
- [13. 实施计划](#13-实施计划)

---

## 1. 概述

### 1.1 设计目标

HeartbeatCat 插件系统允许第三方开发者扩展应用能力。一个插件可以同时提供两种能力：

- **桌面组件**（Widget）：以悬浮窗形式展示在桌面上，运行在 Tauri WebviewWindow 中
- **推流插件**（Streaming）：通过 HTTP 服务提供页面，可嵌入 OBS 等推流软件作为浏览器源

### 1.2 核心原则

- **能力声明制**：插件通过目录结构声明能力，不依赖枚举值区分类型
- **配置驱动 UI**：插件用 JSON Schema 自描述可配置项，主应用根据 Schema 自动生成设置表单
- **构建工具自动化**：插件开发者只需编写 `hrcat.config.ts`，manifest 由构建工具生成
- **SSE 统一数据通道**：推流插件通过 Server-Sent Events 接收实时数据，无需 Tauri API

---

## 2. 插件清单（Manifest）

### 2.1 文件名

`hbcat-manifest.json`，必须位于插件包根目录。

### 2.2 完整 Schema

```jsonc
{
  "manifestVersion": 1,

  // ===== 插件元信息 =====
  "plugin": {
    "id": "com.example.heart-rate-display",
    "name": "心率显示器",
    "version": "1.0.0",
    "description": "在桌面悬浮窗或 OBS 直播画面中显示实时心率",
    "author": { "name": "Timothy Yin", "email": "master@uniiem.com" },
    "homepage": "https://example.com",
    "icon": "icon.png"
  },

  // ===== 桌面组件能力（存在此字段 = 声明该能力）=====
  "widget": {
    "entry": "widget/index.html",
    "window": {
      "width": 200,
      "height": 150,
      "resizable": true,
      "alwaysOnTop": true,
      "transparent": true
    }
  },

  // ===== 推流插件能力（存在此字段 = 声明该能力）=====
  "streaming": {
    "entry": "streaming/index.html",
    "viewport": { "width": 1920, "height": 1080 }
  },

  // ===== 事件订阅声明 =====
  "permissions": [
    "heart-rate",
    "device-connected",
    "device-disconnected"
  ],

  // ===== 插件自定义设置（JSON Schema）=====
  "settings": {
    "type": "object",
    "properties": {
      "displayUnit": {
        "type": "string",
        "enum": ["bpm", "percentage"],
        "default": "bpm",
        "title": "显示单位"
      }
    }
  }
}
```

### 2.3 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `manifestVersion` | `number` | 是 | manifest 格式版本，当前为 `1` |
| `plugin.id` | `string` | 是 | 插件唯一标识，推荐反向域名格式 |
| `plugin.name` | `string` | 是 | 插件显示名称 |
| `plugin.version` | `string` | 是 | 语义化版本号 |
| `plugin.description` | `string` | 否 | 插件描述 |
| `plugin.author` | `object` | 否 | 作者信息 `{ name, email }` |
| `plugin.homepage` | `string` | 否 | 插件主页 |
| `plugin.icon` | `string` | 否 | 图标文件路径，相对于插件根目录 |
| `widget` | `object` | 否 | 存在则声明桌面组件能力 |
| `widget.entry` | `string` | `widget` 存在时必填 | 桌面组件入口 HTML 文件 |
| `widget.window` | `object` | `widget` 存在时必填 | 窗口默认参数 |
| `widget.window.width` | `number` | 是 | 窗口宽度 (px) |
| `widget.window.height` | `number` | 是 | 窗口高度 (px) |
| `widget.window.alwaysOnTop` | `boolean` | 是 | 是否置顶 |
| `widget.window.transparent` | `boolean` | 是 | 是否透明 |
| `streaming` | `object` | 否 | 存在则声明推流插件能力 |
| `streaming.entry` | `string` | `streaming` 存在时必填 | 推流插件入口 HTML 文件 |
| `streaming.viewport` | `object` | `streaming` 存在时必填 | 推荐视口尺寸 |
| `streaming.viewport.width` | `number` | 是 | 推荐宽度 (px) |
| `streaming.viewport.height` | `number` | 是 | 推荐高度 (px) |
| `permissions` | `string[]` | 是 | 声明订阅的系统事件列表 |
| `settings` | `object` | 否 | JSON Schema，描述插件可配置项 |

### 2.4 校验规则

- `widget` 和 `streaming` 至少存在一个
- 若 `widget` 存在，`widget.entry`、`widget.window`、`window.width`、`window.height` 均必填
- 若 `streaming` 存在，`streaming.entry`、`streaming.viewport` 均必填
- `manifestVersion` 必须为数字
- `plugin.id` 必须为非空字符串

---

## 3. 插件包结构

### 3.1 完整目录结构

```
{plugin-id}/
├── hbcat-manifest.json       ← 清单文件（必需）
├── icon.png                  ← 图标（可选，默认在 manifest.plugin.icon 中指定）
├── widget/                   ← 桌面组件（可选，存在即声明 widget 能力）
│   ├── index.html
│   └── assets/
└── streaming/                ← 推流插件（可选，存在即声明 streaming 能力）
    ├── index.html
    └── assets/
```

### 3.2 分发包格式

`.hrcp` 为 ZIP 格式压缩包，内部结构同上。安装时解压验证。

---

## 4. 插件存储与查找

### 4.1 三级存储

插件按来源分三级存储，优先级从高到低：

| 优先级 | 目录 | 用途 | 生命周期 |
|--------|------|------|----------|
| 1 | `{项目根}/dev-plugins/{id}/` | 开发中的插件 | 手动管理，仅 debug 构建可用 |
| 2 | `$APPDATA/plugins/{id}/` | 用户安装的插件 | 通过安装/卸载管理 |
| 3 | `$RESOURCE/plugins/{id}/` | 内置插件 | 随应用安装包分发 |

- `$APPDATA` 和 `$RESOURCE` 为 Tauri 标准路径，`BaseDirectory` 枚举值
- 同名 `id` 的插件，高优先级覆盖低优先级

### 4.2 查找逻辑

warp HTTP 服务器对 `/p/{id}/*` 请求的解析流程：

```
1. {项目根}/dev-plugins/{id}/      ← 仅 #[cfg(debug_assertions)]
2. $APPDATA/plugins/{id}/
3. $RESOURCE/plugins/{id}/
```

前端 Store 刷新插件列表时遵循相同的优先级顺序。

### 4.3 内置插件打包

- 内置插件放置在 `src-tauri/plugins/{id}/`
- `tauri.conf.json` 中 `bundle.resources` 包含 `"plugins"`
- `pnpm tauri build` 时自动将 `src-tauri/plugins/` 打包进安装包的 `resources/` 目录
- 运行时 `BaseDirectory.Resource` + `"plugins"` = 内置插件路径
- 由前端加载时根据来源路径标记 `builtin: true`

---

## 5. 桌面组件（Widget）

### 5.1 运行环境

- 独立的 Tauri `WebviewWindow`
- 无标题栏（`decorations: false`）
- 透明背景（`transparent: true`）
- 参数由 manifest 的 `widget.window` 定义

### 5.2 生命周期

```
安装 → 设置 → 激活（创建窗口）→ 运行（接收事件）→ 停用（关闭窗口）→ 卸载
```

### 5.3 数据通信

Widget 运行在 Tauri Webview 中，可使用完整 Tauri API：

- 事件接收：`listen('heart-rate', callback)` 等
- 配置读取：`invoke('get_plugin_config', { pluginId })`
- 窗口拖拽：HTML 元素添加 `data-tauri-drag-region` 属性

### 5.4 窗口管理

- 每个激活的 Widget 创建一个 `WebviewWindow`，label 格式为 `widget_{pluginId}`
- 窗口参数由 manifest `widget.window` 定义
- 运行时窗口状态（位置、大小）由 Tauri 自动保存

---

## 6. 推流插件（Streaming）

### 6.1 运行环境

- 通过 warp HTTP 服务器提供静态页面
- 用户将页面 URL 添加到 OBS 等推流软件作为"浏览器源"
- 运行在标准浏览器环境中，无 Tauri API

### 6.2 生命周期

```
安装 → 设置 → 启动（SSE 开始推送）→ OBS 添加浏览器源 → 运行 → 停止 → 卸载
```

### 6.3 数据通信

推流插件无法使用 Tauri API，通过 HTTP 接口与后端交互：

- 实时数据：`new EventSource('/p/{id}/events')` — SSE 端点
- 配置读取：`fetch('/p/{id}/config')` — HTTP GET
- 系统状态：`fetch('/api/status')` — HTTP GET

### 6.4 OBS 浏览器源

- 用户从插件详情面板复制 URL（如 `http://127.0.0.1:9918/p/{id}/streaming/index.html`）
- 在 OBS 中添加浏览器源，粘贴 URL
- 视口尺寸参考 manifest 的 `streaming.viewport`

---

## 7. 插件安装与卸载

### 7.1 安装入口

- **拖拽安装**：将 `.hrcp` 文件拖入主窗口
- **按钮安装**：点击「安装插件」按钮，通过文件选择器选择 `.hrcp` 文件

### 7.2 安装流程

```
1. 解压 ZIP 到临时目录
2. 读取 hbcat-manifest.json，执行校验（参见 2.4）
   → 校验失败：提示用户，终止
3. 提取 plugin.id
4. 检查 $APPDATA/plugins/{id}/ 是否存在
   → 不存在：直接安装
   → 存在且版本相同：弹窗"相同版本已安装，是否覆盖？"
   → 存在且版本不同：弹窗"已安装 v{x}，是否升级到 v{y}？"
5. 删除已存在的 $APPDATA/plugins/{id}/（如有）
6. 将临时目录内容移动到 $APPDATA/plugins/{id}/
7. 若 settings schema 存在，生成默认配置写入 $APPDATA/plugin-config/{id}.json
8. 通知前端刷新插件列表
```

### 7.3 卸载流程

```
1. 弹窗确认："确定卸载「{name}」吗？"
2. 若 widget 已激活 → 调用 close_widget() 关闭窗口
3. 若 streaming 已启动 → 调用 stop_streaming() 停止 SSE
4. 删除 $APPDATA/plugins/{id}/
5. 删除 $APPDATA/plugin-config/{id}.json
6. 刷新插件列表
```

### 7.4 内置插件

- `builtin: true` 的插件不可卸载（按钮置灰）
- 随应用整体版本升级

---

## 8. 插件配置管理

### 8.1 三层体系

```
$APPDATA/config.json                    ← 全局系统配置（warp 端口等）
$APPDATA/plugin-config/{id}.json        ← 每个插件的用户设置
内存中 Pinia Store                       ← 运行时状态（激活/运行状态、窗口位置等）
```

### 8.2 设置读写

| 操作 | Widget 调用方式 | Streaming 调用方式 |
|------|----------------|-------------------|
| 读取设置 | `invoke('get_plugin_config', { pluginId })` | `fetch('/p/{id}/config')` |
| 写入设置 | 由主应用前端操作，调用 `invoke('set_plugin_config', ...)` | 同左 |

### 8.3 设置表单渲染

前端根据 `settings` JSON Schema 自动生成表单控件：

| JSON Schema | 控件 |
|-------------|------|
| `type: "string"` | `<input type="text">` |
| `type: "string"` + `enum` | `<select>` |
| `type: "number"` / `"integer"` | `<input type="number">` |
| `type: "boolean"` | toggle |
| `type: "string"` + `format: "color"` | `<input type="color">` |

使用 `title` 作标签，`default` 作初始值，`minimum`/`maximum`/`enum` 作用于校验。

---

## 9. 插件开发框架

### 9.1 项目结构（hrcat-widget-example）

```
my-plugin/
├── hrcat.config.ts           ← 插件专属配置
├── package.json              ← 提供 id(name)、version、description、author
├── vite.config.ts            ← 极简配置
│
├── widget/                   ← 桌面组件（存在 → 声明能力）
│   ├── index.html
│   └── src/
│       ├── main.ts
│       └── App.vue
│
├── streaming/                ← 推流插件（存在 → 声明能力）
│   ├── index.html
│   └── src/
│       ├── main.ts
│       └── App.vue
│
└── shared/                   ← 共享代码（可选）
    └── composables/
```

### 9.2 hrcat.config.ts

```ts
import { defineConfig } from '@hrcat/vite-plugin'

export default defineConfig({
  widget: {
    window: {
      defaultWidth: 200,
      defaultHeight: 150,
      minWidth: 80,
      minHeight: 80,
      resizable: true,
      alwaysOnTop: true,
    },
  },
  streaming: {
    viewport: { width: 1920, height: 1080 },
  },
  permissions: ['heart-rate', 'device-connected'],
  settings: {
    type: 'object',
    properties: {
      displayUnit: {
        type: 'string',
        enum: ['bpm', 'percentage'],
        default: 'bpm',
        title: '显示单位',
      },
    },
  },
})
```

### 9.3 @hrcat/vite-plugin 行为

1. 读取 `hrcat.config.ts` 和 `package.json`
2. 检测 `widget/`、`streaming/` 目录的存在性 → 决定构建哪些入口
3. 为每个入口配置独立的 Vite 构建
4. `writeBundle` 阶段自动生成 `hbcat-manifest.json`
5. 输出 `dist/{plugin-id}/` 并打包为 `dist/{plugin-id}.hrcp`
6. 若设置了 `HRCAT_TARGET` 环境变量，dev 模式下自动同步产物到目标项目的 `dev-plugins/`

### 9.4 构建产物

```
dist/
├── com.example.my-plugin/
│   ├── hbcat-manifest.json      ← 自动生成
│   ├── icon.png
│   ├── widget/
│   │   ├── index.html
│   │   └── assets/
│   └── streaming/
│       ├── index.html
│       └── assets/
└── com.example.my-plugin.hrcp
```

### 9.5 入口 HTML 差异

**widget/index.html**（桌面组件）：
- 根元素需 `data-tauri-drag-region`
- 可使用 `@tauri-apps/api`（`listen`、`invoke`）

**streaming/index.html**（推流插件）：
- 不能使用 `@tauri-apps/api`
- 使用 `EventSource` 和 `fetch` 与 warp API 交互

---

## 10. 数据流与事件系统

### 10.1 架构总览

```
                        BLE 蓝牙设备
                             │
                      heart-rate 值
                             │
                             ▼
                    ┌────────────────┐
                    │  Event Router  │  (Rust, 单例)
                    │  · heart-rate  │
                    │  · device-*    │
                    └───────┬────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌──────────────┐ ┌────────────┐ ┌──────────────┐
    │ Tauri Events │ │ SSE Push   │ │ Config Store │
    │ (广播，无过滤)│ │ (按permiss-│ │ (文件读写)    │
    │              │ │  ions过滤) │ │              │
    └──────┬───────┘ └─────┬──────┘ └──────┬───────┘
           │               │               │
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌──────────────┐
    │ Widget     │  │ Streaming  │  │ 任意入口均可  │
    │ Webview    │  │ (OBS 内嵌) │  │ 读取自身配置   │
    │ listen()   │  │EventSource │  │              │
    └────────────┘  └────────────┘  └──────────────┘
```

### 10.2 事件类型

| 事件名 | 触发时机 | 数据 |
|--------|---------|------|
| `heart-rate` | BLE 收到心率数据 | `{ value: number, timestamp: number }` |
| `device-connected` | 蓝牙设备连接成功 | `{ peripheral_id, name, address }` |
| `device-disconnected` | 蓝牙设备断开 | `{}` |

### 10.3 SSE 端点

- URL：`/p/{id}/events`
- SSE 事件格式：
  ```
  event: heart-rate
  data: {"value":72,"timestamp":1700000000}

  event: device-connected
  data: {"peripheral_id":"...","name":"...","address":"..."}
  ```
- 只推送该插件 `permissions` 中声明的事件类型

---

## 11. 主应用前端架构

### 11.1 页面路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | `index.vue` | 设备连接 |
| `/charts` | `charts.vue` | 心率记录 |
| `/plugins` | `plugins.vue` | 统一插件管理（原 `/widgets` + `/streaming-plugins`） |
| `/settings` | `settings.vue` | 应用设置 |

### 11.2 /plugins 页面布局

- 左侧：插件列表（图标、名称、版本、能力标签、状态指示）
- 右侧：选中插件的详情面板
  - 基本信息
  - Tab: 桌面组件（状态、窗口参数、激活/停用按钮）
  - Tab: 推流插件（状态、OBS URL、复制地址、启动/停止按钮）
  - Tab: 设置（根据 JSON Schema 动态渲染表单）

### 11.3 Pinia Store

```ts
// stores/plugin.ts

interface PluginMeta {
  id: string
  name: string
  version: string
  description?: string
  author?: { name: string; email: string }
  homepage?: string
  icon?: string
}

interface WidgetCapability {
  entry: string
  window: {
    defaultWidth: number; defaultHeight: number
    minWidth: number; minHeight: number
    resizable: boolean; alwaysOnTop: boolean; transparent: boolean
  }
}

interface StreamingCapability {
  entry: string
  viewport: { width: number; height: number }
}

interface PluginManifest {
  manifestVersion: number
  plugin: PluginMeta
  widget?: WidgetCapability
  streaming?: StreamingCapability
  permissions: string[]
  settings?: Record<string, any>
  builtin: boolean
}

interface PluginState {
  widgetActive: boolean
  streamingActive: boolean
  settings: Record<string, unknown>
}
```

---

## 12. 主应用后端架构

### 12.1 Tauri Commands

```rust
// 插件生命周期
install_plugin(source: String) -> PluginManifest
uninstall_plugin(id: String)
get_plugins() -> Vec<PluginWithState>

// 配置
get_plugin_config(id: String) -> Value
set_plugin_config(id: String, config: Value)

// Widget 控制
open_widget(id: String)
close_widget(id: String)

// Streaming 控制
start_streaming(id: String)
stop_streaming(id: String)
get_streaming_url(id: String) -> String
```

### 12.2 warp HTTP 路由

| 路由 | 功能 |
|------|------|
| `GET /p/{id}/*` | 插件静态文件服务，按三级目录优先级查找 |
| `GET /p/{id}/events` | SSE 端点，推送该插件订阅的事件 |
| `GET /p/{id}/config` | 返回该插件当前用户设置 |
| `GET /api/status` | 全局状态快照 |

### 12.3 SSE 广播器

- 每个启动 streaming 的插件持有一个 SSE 连接列表
- Event Router 收到事件后，按插件的 `permissions` 过滤，推送到对应 SSE 端点
- Tauri 事件通道对 Widget 无过滤（广播全部事件）

---

## 13. 实施计划

| 阶段 | 内容 | 关键产出 |
|------|------|---------|
| P1 — 类型定义 | TypeScript 类型 + manifest JSON Schema 校验 | `src/types/plugin.ts` |
| P2 — 构建工具链 | `@hrcat/vite-plugin`：多入口构建、自动生成 manifest、打包 `.hrcp` | npm 包 |
| P3 — Rust 后端 | Tauri commands、SSE 广播器、warp 路由重构 | `main.rs` |
| P4 — 前端重构 | 合并 `/widgets` + `/streaming-plugins` → `/plugins`，动态设置表单 | `plugins.vue`、Store |
| P5 — 安装流程 | 拖拽/按钮安装、冲突检测、卸载 | 前端 + Rust commands |
| P6 — 示例改造 | `hrcat-widget-example` 改为新格式参考模板 | 示例项目 |
