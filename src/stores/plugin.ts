import { path } from "@tauri-apps/api"
import { invoke } from "@tauri-apps/api/core"
import { BaseDirectory, exists, mkdir, readDir, readTextFile, remove } from "@tauri-apps/plugin-fs"
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
  const _scanDir = async (baseDir: BaseDirectory, searchPath: string, autoCreate = false): Promise<PluginManifest[]> => {
    const result: PluginManifest[] = []

    if (!await exists(searchPath, { baseDir })) {
      if (autoCreate) {
        await mkdir(searchPath, { baseDir, recursive: true })
      }
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

    // 1. 用户安装的插件（高优先级，自动创建目录）
    const userPlugins = await _scanDir(BaseDirectory.AppData, 'plugins', true)
    addIfNew(userPlugins, false)

    // 2. 内置插件（低优先级，不自动创建）
    const builtinPlugins = await _scanDir(BaseDirectory.Resource, 'plugins', false)
    addIfNew(builtinPlugins, true)

    plugins.value = allLoaded

    // 恢复运行时配置
    await restoreRuntimeConfigs()

    // 清理已卸载/删除插件的孤立配置文件
    await cleanupOrphanedConfigs()
  }

  const cleanupOrphanedConfigs = async () => {
    const configDir = 'plugin-config'
    if (!await exists(configDir, { baseDir: BaseDirectory.AppData })) return

    const entries = await readDir(configDir, { baseDir: BaseDirectory.AppData })
    const validIds = new Set(plugins.value.map(p => p.manifest.plugin.id))

    for (const entry of entries) {
      if (!entry.name?.endsWith('.json')) continue
      const id = entry.name.replace('.json', '')
      if (!validIds.has(id)) {
        const configPath = await path.join(configDir, entry.name)
        try {
          await remove(configPath, { baseDir: BaseDirectory.AppData })
          console.log(`[Plugin] 已清理孤立配置: ${id}`)
        } catch { /* ignore */ }
      }
    }
  }

  const restoreRuntimeConfigs = async () => {
    for (const p of plugins.value) {
      const id = p.manifest.plugin.id
      const configPath = await path.join('plugin-config', `${id}.json`)
      try {
        if (await exists(configPath, { baseDir: BaseDirectory.AppData })) {
          const raw = await readTextFile(configPath, { baseDir: BaseDirectory.AppData })
          const cfg = JSON.parse(raw)
          if (cfg._runtime) {
            const state = getState(id)
            if (cfg._runtime.clickThrough !== undefined) state.clickThrough = cfg._runtime.clickThrough
            if (cfg._runtime.opacity !== undefined) state.opacity = cfg._runtime.opacity
            if (cfg._runtime.scale !== undefined) state.scale = cfg._runtime.scale
            if (cfg._runtime.widgetActive !== undefined) state.widgetActive = cfg._runtime.widgetActive
            if (cfg._runtime.streamingActive !== undefined) state.streamingActive = cfg._runtime.streamingActive
            states.value[id] = state
          }
        }
      } catch { /* ignore */ }
    }
  }

  // ── 持久化运行时状态到配置文件 ──
  const persistRuntimeState = async (pluginId: string) => {
    const state = getState(pluginId)
    try {
      await invoke('set_plugin_config', {
        pluginId,
        config: {
          _runtime: {
            widgetActive: state.widgetActive,
            streamingActive: state.streamingActive,
            clickThrough: state.clickThrough,
            opacity: state.opacity,
            scale: state.scale,
          },
        },
      })
    } catch { /* ignore */ }
  }

  // ── Widget 状态管理 ──
  const setWidgetActive = (pluginId: string, active: boolean) => {
    const state = getState(pluginId)
    state.widgetActive = active
    states.value[pluginId] = state
    persistRuntimeState(pluginId)
  }

  // ── Streaming 状态管理 ──
  const setStreamingActive = (pluginId: string, active: boolean) => {
    const state = getState(pluginId)
    state.streamingActive = active
    states.value[pluginId] = state
    persistRuntimeState(pluginId)
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
    persistRuntimeState,
  }
})
