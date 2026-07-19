import { path } from "@tauri-apps/api"
import { BaseDirectory, exists, mkdir, readDir, readTextFile } from "@tauri-apps/plugin-fs"
import { defineStore } from "pinia"
import { ref } from "vue"
import type { LoadedPlugin, PluginManifest, PluginRuntimeState } from "../types/plugin"

const DEFAULT_STATE: PluginRuntimeState = {
  widgetActive: false,
  streamingActive: false,
  clickThrough: false,
  opacity: 1.0,
  scale: 1.0,
  config: {},
}

export const usePluginManager = defineStore('pluginManager', () => {
  const plugins = ref<LoadedPlugin[]>([])
  const states = ref<Record<string, PluginRuntimeState>>({})

  // ── 从指定目录扫描插件 ──
  const _scanDir = async (baseDir: BaseDirectory, searchPath: string): Promise<PluginManifest[]> => {
    const result: PluginManifest[] = []

    if (!await exists(searchPath, { baseDir })) {
      await mkdir(searchPath, { baseDir, recursive: true })
      return result
    }

    const entries = await readDir(searchPath, { baseDir })

    for (const entry of entries) {
      if (!entry.isDirectory) continue

      const manifestPath = await path.join(searchPath, entry.name, 'hbcat-manifest.json')

      if (!(await exists(manifestPath, { baseDir }))) continue

      try {
        const raw = JSON.parse(await readTextFile(manifestPath, { baseDir }))
        // 基本校验
        if (!raw.manifestVersion || !raw.plugin?.id) continue
        result.push(raw as PluginManifest)
      } catch {
        // 解析失败则跳过
      }
    }

    return result
  }

  // ── 获取或初始化插件运行时状态 ──
  const getState = (pluginId: string): PluginRuntimeState => {
    if (!states.value[pluginId]) {
      states.value[pluginId] = { ...DEFAULT_STATE }
    }
    return states.value[pluginId]
  }

  // ── 刷新插件列表（优先级：AppData 用户插件 > Resource 内置插件） ──
  const refreshPlugins = async () => {
    const allLoaded: LoadedPlugin[] = []
    const seen = new Set<string>()

    const addIfNew = (manifests: PluginManifest[], builtin: boolean) => {
      for (const m of manifests) {
        if (!seen.has(m.plugin.id)) {
          seen.add(m.plugin.id)
          allLoaded.push({ manifest: m, builtin })
        }
      }
    }

    // 1. 用户安装的插件（高优先级）
    const userPlugins = await _scanDir(BaseDirectory.AppData, 'plugins')
    addIfNew(userPlugins, false)

    // 2. 内置插件（低优先级）
    const builtinPlugins = await _scanDir(BaseDirectory.Resource, 'plugins')
    addIfNew(builtinPlugins, true)

    plugins.value = allLoaded
  }

  // ── Widget 状态管理 ──
  const setWidgetActive = (pluginId: string, active: boolean) => {
    const state = getState(pluginId)
    state.widgetActive = active
    states.value[pluginId] = state
  }

  // ── Streaming 状态管理 ──
  const setStreamingActive = (pluginId: string, active: boolean) => {
    const state = getState(pluginId)
    state.streamingActive = active
    states.value[pluginId] = state
  }

  // ── 配置管理 ──
  const setClickThrough = (pluginId: string, clickThrough: boolean) => {
    const state = getState(pluginId)
    state.clickThrough = clickThrough
    states.value[pluginId] = state
  }

  const setOpacity = (pluginId: string, opacity: number) => {
    const state = getState(pluginId)
    state.opacity = opacity
    states.value[pluginId] = state
  }

  const setScale = (pluginId: string, scale: number) => {
    const state = getState(pluginId)
    state.scale = scale
    states.value[pluginId] = state
  }

  const updateConfig = (pluginId: string, config: Record<string, unknown>) => {
    const state = getState(pluginId)
    state.config = { ...state.config, ...config }
    states.value[pluginId] = state
  }

  // ── 获取插件（合并 manifest + 状态） ──
  const getPlugin = (pluginId: string) => {
    const loaded = plugins.value.find(p => p.manifest.plugin.id === pluginId)
    if (!loaded) return null
    return {
      ...loaded,
      state: getState(pluginId),
    }
  }

  return {
    plugins,
    states,
    refreshPlugins,
    getState,
    setWidgetActive,
    setStreamingActive,
    updateConfig,
    setClickThrough,
    setOpacity,
    setScale,
    getPlugin,
  }
})
