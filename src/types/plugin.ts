// ── 插件元信息（来自 manifest.plugin） ──
export interface PluginMeta {
  id: string
  name: string
  version: string
  description?: string
  author?: {
    name?: string
    email?: string
  }
  homepage?: string
  icon?: string
}

// ── 桌面组件能力声明 ──
export interface WidgetCapability {
  entry: string
  window: {
    width: number
    height: number
    alwaysOnTop: boolean
    transparent: boolean
  }
}

// ── 推流插件能力声明 ──
export interface StreamingCapability {
  entry: string
  viewport: {
    width: number
    height: number
  }
}

// ── hbcat-manifest.json 完整结构 ──
export interface PluginManifest {
  manifestVersion: number
  plugin: PluginMeta
  widget?: WidgetCapability
  streaming?: StreamingCapability
  permissions: string[]
  settings?: Record<string, unknown>
}

// ── 加载后的插件（附加 builtin 标记） ──
export interface LoadedPlugin {
  manifest: PluginManifest
  builtin: boolean
}

// ── 运行时状态（Store 动态管理） ──
export interface PluginRuntimeState {
  widgetActive: boolean
  streamingActive: boolean
  clickThrough: boolean
  opacity: number
  config: Record<string, unknown>
}

// ── 合并后的完整插件视图 ──
export interface PluginEntry {
  manifest: PluginManifest
  builtin: boolean
  state: PluginRuntimeState
}
