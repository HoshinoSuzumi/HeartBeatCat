<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { usePluginManager } from '../stores/plugin'
import { getAllWebviewWindows } from '@tauri-apps/api/webviewWindow'
import { useSnackbar } from 'vue3-snackbar'
import { appDataDir, resolve } from '@tauri-apps/api/path'
import { openPath } from '@tauri-apps/plugin-opener'
import { open } from '@tauri-apps/plugin-dialog'
import type { LoadedPlugin, PluginManifest } from '../types/plugin'
import PluginSettingsForm from '../components/PluginSettingsForm.vue'
import { useConfirmDialog } from '../composables/useConfirmDialog'

const pluginMgr = usePluginManager()
const dialog = useConfirmDialog()
const snackbar = useSnackbar()

const selectedId = ref<string | null>(null)
const activeTab = ref<'widget' | 'streaming' | 'settings'>('widget')

// ── 插件列表（合并运行时状态） ──
const pluginList = computed(() =>
  pluginMgr.plugins.map(p => ({
    ...p,
    state: pluginMgr.getState(p.manifest.plugin.id),
  })),
)

const selectedPlugin = computed(() => {
  if (!selectedId.value) return null
  return pluginList.value.find(p => p.manifest.plugin.id === selectedId.value) ?? null
})

// ── 选中插件时重置 tab ──
const selectPlugin = (id: string) => {
  selectedId.value = id
  const p = pluginList.value.find(x => x.manifest.plugin.id === id)
  if (!p) return
  // 默认打开第一个可用的 tab
  if (p.manifest.widget) activeTab.value = 'widget'
  else if (p.manifest.streaming) activeTab.value = 'streaming'
  else activeTab.value = 'settings'
}

// ── Widget 控制 ──
const toggleWidget = async (plugin: LoadedPlugin) => {
  const id = plugin.manifest.plugin.id
  const state = pluginMgr.getState(id)

  if (state.widgetActive) {
    await closeWidget(plugin)
  } else {
    await openWidget(plugin)
  }
}

const openWidget = async (plugin: LoadedPlugin) => {
  const id = plugin.manifest.plugin.id
  // 检查窗口是否已存在
  const existingWindows = await getAllWebviewWindows()
  const label = `widget_${id}`
  if (existingWindows.some(w => w.label === label)) {
    pluginMgr.setWidgetActive(id, true)
    return
  }

  try {
    await invoke('open_widget', { pluginId: id })
    pluginMgr.setWidgetActive(id, true)
  } catch (e) {
    snackbar.add({ type: 'error', text: `打开组件失败: ${e}` })
  }
}

const closeWidget = async (plugin: LoadedPlugin) => {
  const id = plugin.manifest.plugin.id
  try {
    await invoke('close_widget', { pluginId: id })
    pluginMgr.setWidgetActive(id, false)
  } catch (e) {
    snackbar.add({ type: 'error', text: `关闭组件失败: ${e}` })
  }
}

// ── Streaming 控制 ──
const toggleStreaming = async (plugin: LoadedPlugin) => {
  const id = plugin.manifest.plugin.id
  const state = pluginMgr.getState(id)

  if (state.streamingActive) {
    await stopStreaming(id)
  } else {
    await startStreaming(id)
  }
}

const startStreaming = async (pluginId: string) => {
  try {
    await invoke('start_streaming', { pluginId })
    pluginMgr.setStreamingActive(pluginId, true)
  } catch (e) {
    snackbar.add({ type: 'error', text: `启动推流服务失败: ${e}` })
  }
}

const stopStreaming = async (pluginId: string) => {
  try {
    await invoke('stop_streaming', { pluginId })
    pluginMgr.setStreamingActive(pluginId, false)
  } catch (e) {
    snackbar.add({ type: 'error', text: `停止推流服务失败: ${e}` })
  }
}

const streamingUrl = computed(() => {
  const id = selectedPlugin.value?.manifest.plugin.id
  if (!id) return ''
  const entry = selectedPlugin.value?.manifest.streaming?.entry ?? 'index.html'
  return `http://127.0.0.1:9918/p/${id}/${entry}`
})

const copyStreamingUrl = () => {
  navigator.clipboard.writeText(streamingUrl.value)
  snackbar.add({ type: 'info', text: '已复制 OBS 浏览器源地址' })
}

// ── 安装插件 ──
const installPlugin = async () => {
  try {
    const selected = await open({
      title: '选择插件包',
      filters: [{ name: 'HeartbeatCat 插件', extensions: ['brcp'] }],
      multiple: false,
    })
    if (!selected) return

    const filePath = typeof selected === 'string' ? selected : (selected as any).path ?? selected
    await doInstall(filePath)
  } catch (e) {
    snackbar.add({ type: 'error', text: `安装失败: ${e}` })
  }
}

const doInstall = async (filePath: string, force = false) => {
  try {
    const result = await invoke<any>('install_plugin', { filePath, force })

    if (result.action === 'confirm') {
      const ok = await dialog.warn({
        title: '更新插件',
        message: `已安装「${result.pluginName}」v${result.oldVersion}，将要安装 v${result.newVersion}。是否确认更新？`,
        confirmText: '确认更新',
      })
      if (!ok) return
      await doInstall(filePath, true)
      return
    }

    // 安装/升级成功
    await pluginMgr.refreshPlugins()
    selectedId.value = result.pluginId
    snackbar.add({
      type: 'success',
      text: result.action === 'upgraded'
        ? `已升级「${result.pluginName}」v${result.version}`
        : `已安装「${result.pluginName}」v${result.version}`,
    })
  } catch (e: any) {
    const msg = String(e)
    if (msg.startsWith('SAME_VERSION:')) {
      snackbar.add({ type: 'warning', text: `已安装相同版本 v${msg.replace('SAME_VERSION:', '')}` })
    } else if (msg.startsWith('BUILTIN:')) {
      const name = msg.replace('BUILTIN:', '')
      snackbar.add({ type: 'warning', text: `「${name}」是内置插件，无法手动安装` })
    } else {
      snackbar.add({ type: 'error', text: `安装失败: ${msg}` })
    }
  }
}

// ── 卸载插件 ──
const promptUninstall = async (pluginId: string) => {
  const ok = await dialog.danger({
    title: '确认卸载',
    message: '确定要卸载此插件吗？相关的桌面组件窗口和推流服务将被关闭。',
    confirmText: '确认卸载',
  })
  if (!ok) return
  await doUninstall(pluginId)
}

const doUninstall = async (pluginId: string) => {
  // 先停用相关能力
  const state = pluginMgr.getState(pluginId)
  if (state.widgetActive) {
    try { await invoke('close_widget', { pluginId }) } catch {}
    pluginMgr.setWidgetActive(pluginId, false)
  }
  if (state.streamingActive) {
    try { await invoke('stop_streaming', { pluginId }) } catch {}
    pluginMgr.setStreamingActive(pluginId, false)
  }

  try {
    await invoke('uninstall_plugin', { pluginId })
    if (selectedId.value === pluginId) selectedId.value = null
    await pluginMgr.refreshPlugins()
    snackbar.add({ type: 'success', text: '插件已卸载' })
  } catch (e) {
    snackbar.add({ type: 'error', text: `卸载失败: ${e}` })
  }
}

// ── 设置管理 ──

// ── 工具操作 ──
const openPluginDir = async () => {
  try {
    const dataDir = await appDataDir()
    const dir = await resolve(dataDir, 'plugins')
    await openPath(dir)
  } catch (e) {
    snackbar.add({ type: 'error', text: `打开插件目录失败: ${e}` })
  }
}

const refreshAll = async () => {
  await pluginMgr.refreshPlugins()
  // 同步 Widget 状态
  const windows = await getAllWebviewWindows()
  const activeLabels = new Set(windows.map(w => w.label))
  for (const p of pluginMgr.plugins) {
    const id = p.manifest.plugin.id
    const label = `widget_${id}`
    pluginMgr.setWidgetActive(id, activeLabels.has(label))
  }
}

// ── 设置管理 ──
const saveRuntimeConfig = async (pluginId: string) => {
  const state = pluginMgr.getState(pluginId)
  try {
    await invoke('set_plugin_config', {
      pluginId,
      config: {
        _runtime: {
          clickThrough: state.clickThrough,
          opacity: state.opacity,
          scale: state.scale,
        },
      },
    })
  } catch { /* ignore */ }
}

const onToggleClickThrough = async (plugin: { manifest: PluginManifest; state: any }) => {
  const id = plugin.manifest.plugin.id
  const next = !plugin.state.clickThrough
  pluginMgr.setClickThrough(id, next)
  try {
    await invoke('set_widget_click_through', { pluginId: id, clickThrough: next })
    saveRuntimeConfig(id)
  } catch (e) {
    pluginMgr.setClickThrough(id, !next)
    snackbar.add({ type: 'error', text: `设置失败: ${e}` })
  }
}

const onChangeOpacity = async (plugin: { manifest: PluginManifest; state: any }, value: number) => {
  const id = plugin.manifest.plugin.id
  pluginMgr.setOpacity(id, value)
  try {
    await invoke('set_widget_opacity', { pluginId: id, opacity: value })
    saveRuntimeConfig(id)
  } catch (e) {
    pluginMgr.setOpacity(id, 1.0)
    snackbar.add({ type: 'error', text: `设置透明度失败: ${e}` })
  }
}

const onChangeScale = async (plugin: { manifest: PluginManifest; state: any }, value: number) => {
  const id = plugin.manifest.plugin.id
  const w = plugin.manifest.widget
  if (!w) return
  pluginMgr.setScale(id, value)
  try {
    await invoke('set_widget_scale', {
      pluginId: id,
      baseWidth: w.window.width,
      baseHeight: w.window.height,
      scale: value,
    })
    saveRuntimeConfig(id)
  } catch (e) {
    snackbar.add({ type: 'error', text: `设置缩放失败: ${e}` })
  }
}

const onSettingsUpdate = async (config: Record<string, unknown>) => {
  if (!selectedId.value) return
  pluginMgr.updateConfig(selectedId.value, config)
  try {
    await invoke('set_plugin_config', { pluginId: selectedId.value, config })
  } catch (e) {
    snackbar.add({ type: 'error', text: `保存设置失败: ${e}` })
  }
}


onMounted(() => {
  pluginMgr.refreshPlugins()
})
</script>

<template>
  <PageContainer title="插件管理">
    <template #actions>
      <div class="flex items-center gap-2">
        <DevOnly>
          <button class="btn outline text-xs" @click="refreshAll">刷新</button>
        </DevOnly>
        <button class="btn outline text-xs" @click="installPlugin">安装插件</button>
        <DevOnly>
          <button class="btn outline text-xs" @click="openPluginDir">插件目录</button>
        </DevOnly>
      </div>
    </template>

    <div class="flex h-full bg-white">
      <!-- ===== 左侧插件列表 ===== -->
      <div class="w-[200px] border-r border-neutral-200 overflow-y-auto flex-shrink-0">
        <div
          v-for="item in pluginList"
          :key="item.manifest.plugin.id"
          class="pr-3 py-2.5 border-b border-neutral-100 cursor-pointer transition-colors hover:bg-neutral-50"
          :class="selectedId === item.manifest.plugin.id
            ? 'bg-primary-50 border-l-2 border-l-primary-400 pl-2.5'
            : 'pl-3'"
          @click="selectPlugin(item.manifest.plugin.id)"
        >
          <div class="flex items-center gap-0.5">
            <LucidePackage v-if="item.builtin" class="text-sm text-neutral-400 -mt-[2px]" />
            <span class="text-sm font-medium truncate">{{ item.manifest.plugin.name }}</span>
          </div>
          <div class="flex items-center gap-1.5 mt-1">
            <span class="text-xs text-neutral-400">v{{ item.manifest.plugin.version }}</span>
            <!-- <span
              v-for="badge in (item.manifest.widget ? ['桌面'] : []).concat(item.manifest.streaming ? ['推流'] : [])"
              :key="badge"
              class="text-2xs px-1 py-px rounded"
              :class="badge === '桌面组件' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'"
            >
              {{ badge === '桌面组件' ? '桌面' : '推流' }}
            </span> -->
            <SolarWidget2BoldDuotone v-if="item.manifest.widget" class="text-xs" :class="item.state.widgetActive ? 'text-blue-600' : 'text-neutral-400'" />
            <SolarPlayStreamBold v-if="item.manifest.streaming" class="text-xs" :class="item.state.streamingActive ? 'text-emerald-600' : 'text-neutral-400'" />
          </div>
        </div>

        <div v-if="pluginList.length === 0" class="p-4 text-sm text-neutral-400 text-center">
          暂无已安装的插件
        </div>
      </div>

      <!-- ===== 右侧详情面板 ===== -->
      <div class="flex-1 overflow-y-auto">
        <template v-if="selectedPlugin">
          <div class="p-4">
            <!-- 基本信息 -->
            <div class="mb-4">
              <h2 class="text-base font-semibold">{{ selectedPlugin.manifest.plugin.name }}</h2>
              <p class="text-xs text-neutral-400 mt-0.5">{{ selectedPlugin.manifest.plugin.id }}</p>
              <p v-if="selectedPlugin.manifest.plugin.description" class="text-sm text-neutral-500 mt-1">
                {{ selectedPlugin.manifest.plugin.description }}
              </p>
              <div class="flex items-center gap-3 mt-1 text-xs text-neutral-400">
                <span>v{{ selectedPlugin.manifest.plugin.version }}</span>
                <span v-if="selectedPlugin.manifest.plugin.author?.name">
                  {{ selectedPlugin.manifest.plugin.author.name }}
                </span>
              </div>
              <div class="mt-3" v-if="!selectedPlugin.builtin">
                <button class="btn outline text-xs text-red-500 border-red-300 hover:bg-red-50" @click="promptUninstall(selectedPlugin.manifest.plugin.id)">
                  卸载插件
                </button>
              </div>
            </div>

            <!-- Tab 导航 -->
            <div class="flex border-b border-neutral-200 mb-4">
              <button
                v-if="selectedPlugin.manifest.widget"
                class="px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px"
                :class="activeTab === 'widget'
                  ? 'border-primary-400 text-primary-500'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600'"
                @click="activeTab = 'widget'"
              >
                桌面组件
              </button>
              <button
                v-if="selectedPlugin.manifest.streaming"
                class="px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px"
                :class="activeTab === 'streaming'
                  ? 'border-primary-400 text-primary-500'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600'"
                @click="activeTab = 'streaming'"
              >
                推流插件
              </button>
              <button
                class="px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px"
                :class="activeTab === 'settings'
                  ? 'border-primary-400 text-primary-500'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600'"
                @click="activeTab = 'settings'"
              >
                设置
              </button>
            </div>

            <!-- Widget Tab -->
            <div v-if="activeTab === 'widget' && selectedPlugin.manifest.widget" class="space-y-2">
              <!-- 状态 -->
              <div class="flex items-center justify-between">
                <span class="flex items-center gap-1.5 text-xs text-neutral-500">
                  <span class="w-1.5 h-1.5 rounded-full" :class="selectedPlugin.state.widgetActive ? 'bg-emerald-500' : 'bg-neutral-300'" />
                  {{ selectedPlugin.state.widgetActive ? '已启用' : '未启用' }}
                </span>
                <button class="btn text-xs" @click="toggleWidget(selectedPlugin)">
                  {{ selectedPlugin.state.widgetActive ? '停用' : '启用' }}
                </button>
              </div>

              <!-- 组件信息 -->
              <div class="rounded-lg border border-neutral-200 p-3">
                <h4 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">窗口信息</h4>
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span class="text-neutral-400">尺寸</span>
                    <p class="text-neutral-700 font-medium">{{ selectedPlugin.manifest.widget.window.width }} × {{ selectedPlugin.manifest.widget.window.height }}</p>
                  </div>
                  <div>
                    <span class="text-neutral-400">当前缩放</span>
                    <p class="text-neutral-700 font-medium">{{ selectedPlugin.state.scale.toFixed(1) }}×</p>
                  </div>
                  <div>
                    <span class="text-neutral-400">置顶</span>
                    <p class="text-neutral-700 font-medium">{{ selectedPlugin.manifest.widget.window.alwaysOnTop ? '是' : '否' }}</p>
                  </div>
                  <div>
                    <span class="text-neutral-400">透明背景</span>
                    <p class="text-neutral-700 font-medium">{{ selectedPlugin.manifest.widget.window.transparent ? '是' : '否' }}</p>
                  </div>
                </div>
              </div>

              <!-- 运行时设置提示 -->
              <div class="rounded-lg border border-neutral-200 p-3 bg-neutral-50/50">
                <div class="flex items-center justify-between">
                  <div>
                    <h4 class="text-xs font-semibold text-neutral-500">外观与交互</h4>
                    <p class="text-2xs text-neutral-400 mt-0.5">透明度、缩放等设置</p>
                  </div>
                  <button class="btn outline text-xs py-1" @click="activeTab = 'settings'">前往设置</button>
                </div>
              </div>
            </div>

            <!-- Streaming Tab -->
            <div v-if="activeTab === 'streaming' && selectedPlugin.manifest.streaming" class="space-y-2">
              <!-- 状态 -->
              <div class="flex items-center justify-between">
                <span class="flex items-center gap-1.5 text-xs text-neutral-500">
                  <span class="w-1.5 h-1.5 rounded-full" :class="selectedPlugin.state.streamingActive ? 'bg-emerald-500' : 'bg-neutral-300'" />
                  {{ selectedPlugin.state.streamingActive ? '已启动' : '未启动' }}
                </span>
                <button class="btn text-xs" @click="toggleStreaming(selectedPlugin)">
                  {{ selectedPlugin.state.streamingActive ? '停止' : '启动' }}
                </button>
              </div>

              <!-- OBS 地址 -->
              <div class="rounded-lg border border-neutral-200 p-3">
                <h4 class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">OBS 浏览器源</h4>
                <div class="flex items-center gap-2 mb-2">
                  <code class="text-xs bg-neutral-100 px-2 py-1 rounded flex-1 break-all select-all">{{ streamingUrl }}</code>
                  <button class="btn outline text-xs py-1 flex-shrink-0" @click="copyStreamingUrl">复制</button>
                </div>
                <div class="flex items-center gap-4 text-xs text-neutral-400">
                  <span>推荐视口 {{ selectedPlugin.manifest.streaming.viewport.width }}×{{ selectedPlugin.manifest.streaming.viewport.height }}</span>
                </div>
              </div>
            </div>

            <!-- Settings Tab -->
            <div v-if="activeTab === 'settings'" class="space-y-2">
              <!-- 通用设置 -->
              <div v-if="selectedPlugin.manifest.widget" class="border border-neutral-200 rounded p-3">
                <h4 class="text-xs font-semibold text-neutral-600 mb-2">通用设置</h4>
                <div class="space-y-2">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      class="rounded"
                      :checked="selectedPlugin.state.clickThrough"
                      @change="onToggleClickThrough(selectedPlugin)"
                    />
                    <span class="text-xs text-neutral-600">点击穿透</span>
                  </label>
                  <p class="text-2xs text-neutral-400">开启后鼠标事件将穿透组件窗口</p>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-neutral-600 w-16">透明度</span>
                    <input
                      type="range"
                      min="0.2"
                      max="1.0"
                      step="0.05"
                      class="flex-1"
                      :value="selectedPlugin.state.opacity"
                      @input="onChangeOpacity(selectedPlugin, Number(($event.target as HTMLInputElement).value))"
                    />
                    <span class="text-xs text-neutral-400 w-8 text-right">{{ Math.round(selectedPlugin.state.opacity * 100) }}%</span>
                  </div>                  <div class="flex items-center gap-2">
                    <span class="text-xs text-neutral-600 w-16">缩放</span>
                    <input
                      type="range"
                      min="0.5"
                      max="5.0"
                      step="0.1"
                      class="flex-1"
                      :value="selectedPlugin.state.scale"
                      @input="onChangeScale(selectedPlugin, Number(($event.target as HTMLInputElement).value))"
                    />
                    <span class="text-xs text-neutral-400 w-8 text-right">{{ selectedPlugin.state.scale.toFixed(1) }}×</span>
                  </div>                </div>
              </div>

              <!-- 插件自定义设置 -->
              <div v-if="selectedPlugin.manifest.settings" class="border border-neutral-200 rounded p-3">
                <h4 class="text-xs font-semibold text-neutral-600 mb-2">插件设置</h4>
                <PluginSettingsForm
                  :schema="(selectedPlugin.manifest.settings as any)"
                  :config="selectedPlugin.state.config"
                  @update="onSettingsUpdate"
                />
              </div>

              <div v-if="!selectedPlugin.manifest.widget && !selectedPlugin.manifest.settings" class="text-xs text-neutral-400">
                此插件没有可配置项
              </div>
            </div>
          </div>
        </template>

        <!-- 未选中插件 -->
        <div v-else class="flex items-center justify-center h-full">
          <p class="text-sm text-neutral-400">选择一个插件查看详情</p>
        </div>
      </div>
    </div>
  </PageContainer>
</template>
