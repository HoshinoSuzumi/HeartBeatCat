<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { usePluginManager } from '../stores/plugin'
import { useSnackbar } from 'vue3-snackbar'
import { getAllWebviewWindows } from '@tauri-apps/api/webviewWindow'
import { appDataDir, resolve } from '@tauri-apps/api/path'
import { openPath } from '@tauri-apps/plugin-opener'
import { open } from '@tauri-apps/plugin-dialog'
import type { LoadedPlugin, PluginManifest } from '../types/plugin'
import PluginSettingsForm from '../components/PluginSettingsForm.vue'

const pluginMgr = usePluginManager()
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
const installFilePath = ref<string | null>(null)
const confirmUpgrade = ref(false)
const upgradeInfo = ref<{ pluginName: string; oldVersion: string; newVersion: string } | null>(null)

const installPlugin = async () => {
  try {
    const selected = await open({
      title: '选择插件包',
      filters: [{ name: 'HeartbeatCat 插件', extensions: ['brcp'] }],
      multiple: false,
    })
    if (!selected) return

    const filePath = typeof selected === 'string' ? selected : (selected as any).path ?? selected
    installFilePath.value = filePath
    await doInstall(filePath)
  } catch (e) {
    snackbar.add({ type: 'error', text: `安装失败: ${e}` })
  }
}

const doInstall = async (filePath: string, force = false) => {
  try {
    const result = await invoke<any>('install_plugin', { filePath, force })

    if (result.action === 'confirm') {
      // 需要确认升级/降级
      upgradeInfo.value = {
        pluginName: result.pluginName,
        oldVersion: result.oldVersion,
        newVersion: result.newVersion,
      }
      confirmUpgrade.value = true
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
    } else {
      snackbar.add({ type: 'error', text: `安装失败: ${msg}` })
    }
  }
}

const confirmDoUpgrade = async () => {
  confirmUpgrade.value = false
  if (!installFilePath.value) return
  await doInstall(installFilePath.value, true)
}

const cancelUpgrade = () => {
  confirmUpgrade.value = false
  upgradeInfo.value = null
}

// ── 卸载插件 ──
const confirmUninstall = ref(false)
const uninstallTargetId = ref<string | null>(null)

const promptUninstall = (pluginId: string) => {
  uninstallTargetId.value = pluginId
  confirmUninstall.value = true
}

const doUninstall = async () => {
  if (!uninstallTargetId.value) return
  const id = uninstallTargetId.value

  // 先停用相关能力
  const state = pluginMgr.getState(id)
  if (state.widgetActive) {
    try { await invoke('close_widget', { pluginId: id }) } catch {}
    pluginMgr.setWidgetActive(id, false)
  }
  if (state.streamingActive) {
    try { await invoke('stop_streaming', { pluginId: id }) } catch {}
    pluginMgr.setStreamingActive(id, false)
  }

  try {
    await invoke('uninstall_plugin', { pluginId: id })
    if (selectedId.value === id) selectedId.value = null
    await pluginMgr.refreshPlugins()
    snackbar.add({ type: 'success', text: '插件已卸载' })
  } catch (e) {
    snackbar.add({ type: 'error', text: `卸载失败: ${e}` })
  } finally {
    confirmUninstall.value = false
    uninstallTargetId.value = null
  }
}

const cancelUninstall = () => {
  confirmUninstall.value = false
  uninstallTargetId.value = null
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
const onSettingsUpdate = async (config: Record<string, unknown>) => {
  if (!selectedId.value) return
  pluginMgr.updateConfig(selectedId.value, config)
  try {
    await invoke('set_plugin_config', { pluginId: selectedId.value, config })
  } catch (e) {
    snackbar.add({ type: 'error', text: `保存设置失败: ${e}` })
  }
}

// ── 能力标签 ──
const capabilityBadges = (m: PluginManifest) => {
  const badges: string[] = []
  if (m.widget) badges.push('桌面组件')
  if (m.streaming) badges.push('推流插件')
  return badges
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
        <button class="btn outline text-xs" @click="openPluginDir">插件目录</button>
      </div>
    </template>

    <div class="flex h-full bg-white">
      <!-- ===== 左侧插件列表 ===== -->
      <div class="w-[220px] border-r border-neutral-200 overflow-y-auto flex-shrink-0">
        <div
          v-for="item in pluginList"
          :key="item.manifest.plugin.id"
          class="px-3 py-2.5 border-b border-neutral-100 cursor-pointer transition-colors hover:bg-neutral-50"
          :class="{ 'bg-primary-50 border-l-2 border-l-primary-400': selectedId === item.manifest.plugin.id }"
          @click="selectPlugin(item.manifest.plugin.id)"
        >
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-medium truncate">{{ item.manifest.plugin.name }}</span>
            <span v-if="item.builtin" class="text-2xs px-1 py-px rounded bg-neutral-200 text-neutral-500">内置</span>
          </div>
          <div class="flex items-center gap-1.5 mt-1">
            <span class="text-2xs text-neutral-400">v{{ item.manifest.plugin.version }}</span>
            <span
              v-for="badge in capabilityBadges(item.manifest)"
              :key="badge"
              class="text-2xs px-1 py-px rounded"
              :class="badge === '桌面组件' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'"
            >
              {{ badge === '桌面组件' ? '桌面' : '推流' }}
            </span>
          </div>
          <!-- 状态指示 -->
          <div class="flex items-center gap-2 mt-1.5">
            <span v-if="item.manifest.widget" class="flex items-center gap-1 text-2xs">
              <span
                class="w-1.5 h-1.5 rounded-full"
                :class="item.state.widgetActive ? 'bg-emerald-500' : 'bg-neutral-300'"
              />
              <span class="text-neutral-400">{{ item.state.widgetActive ? '已激活' : '未激活' }}</span>
            </span>
            <span v-if="item.manifest.streaming" class="flex items-center gap-1 text-2xs">
              <span
                class="w-1.5 h-1.5 rounded-full"
                :class="item.state.streamingActive ? 'bg-emerald-500' : 'bg-neutral-300'"
              />
              <span class="text-neutral-400">{{ item.state.streamingActive ? '运行中' : '已停止' }}</span>
            </span>
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
                v-if="selectedPlugin.manifest.settings"
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
            <div v-if="activeTab === 'widget' && selectedPlugin.manifest.widget" class="space-y-3">
              <div class="flex items-center gap-3">
                <span class="text-sm text-neutral-600">状态:</span>
                <span
                  class="w-2 h-2 rounded-full"
                  :class="selectedPlugin.state.widgetActive ? 'bg-emerald-500' : 'bg-neutral-300'"
                />
                <span class="text-sm">{{ selectedPlugin.state.widgetActive ? '运行中' : '未激活' }}</span>
              </div>
              <div class="text-sm text-neutral-500 space-y-1">
                <p>默认大小: {{ selectedPlugin.manifest.widget.window.defaultWidth }}×{{ selectedPlugin.manifest.widget.window.defaultHeight }}</p>
                <p>最小大小: {{ selectedPlugin.manifest.widget.window.minWidth }}×{{ selectedPlugin.manifest.widget.window.minHeight }}</p>
                <p>可调大小: {{ selectedPlugin.manifest.widget.window.resizable ? '是' : '否' }}</p>
                <p>置顶: {{ selectedPlugin.manifest.widget.window.alwaysOnTop ? '是' : '否' }}</p>
              </div>
              <button
                class="btn"
                :class="selectedPlugin.state.widgetActive ? 'outline' : ''"
                @click="toggleWidget(selectedPlugin)"
              >
                {{ selectedPlugin.state.widgetActive ? '停用组件' : '激活组件' }}
              </button>
            </div>

            <!-- Streaming Tab -->
            <div v-if="activeTab === 'streaming' && selectedPlugin.manifest.streaming" class="space-y-3">
              <div class="flex items-center gap-3">
                <span class="text-sm text-neutral-600">状态:</span>
                <span
                  class="w-2 h-2 rounded-full"
                  :class="selectedPlugin.state.streamingActive ? 'bg-emerald-500' : 'bg-neutral-300'"
                />
                <span class="text-sm">{{ selectedPlugin.state.streamingActive ? '运行中' : '已停止' }}</span>
              </div>
              <div>
                <label class="text-sm text-neutral-600 block mb-1">OBS 浏览器源地址:</label>
                <div class="flex items-center gap-2">
                  <code class="text-xs bg-neutral-100 px-2 py-1 rounded flex-1 break-all select-all">{{ streamingUrl }}</code>
                  <button class="btn outline text-xs py-1" @click="copyStreamingUrl">复制</button>
                </div>
              </div>
              <p class="text-xs text-neutral-400">
                将此地址添加到 OBS 的「浏览器」源中。推荐视口:
                {{ selectedPlugin.manifest.streaming.viewport.width }}×{{ selectedPlugin.manifest.streaming.viewport.height }}
              </p>
              <button
                class="btn"
                :class="selectedPlugin.state.streamingActive ? 'outline' : ''"
                @click="toggleStreaming(selectedPlugin)"
              >
                {{ selectedPlugin.state.streamingActive ? '停止服务' : '启动服务' }}
              </button>
            </div>

            <!-- Settings Tab -->
            <div v-if="activeTab === 'settings' && selectedPlugin.manifest.settings" class="space-y-4">
              <PluginSettingsForm
                :schema="(selectedPlugin.manifest.settings as any)"
                :config="selectedPlugin.state.config"
                @update="onSettingsUpdate"
              />
            </div>
          </div>
        </template>

        <!-- 未选中插件 -->
        <div v-else class="flex items-center justify-center h-full">
          <p class="text-sm text-neutral-400">选择一个插件查看详情</p>
        </div>
      </div>
    </div>

    <!-- TODO: 将弹窗抽到公共组件中，并封装可复用的 composable -->
    <!-- 升级确认弹窗 -->
    <div v-if="confirmUpgrade" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" @click.self="cancelUpgrade">
      <div class="bg-white rounded-lg shadow-xl p-6 w-80">
        <h3 class="text-sm font-semibold mb-2">更新插件</h3>
        <p class="text-xs text-neutral-500 mb-2" v-if="upgradeInfo">
          已安装 <span class="font-medium">{{ upgradeInfo.pluginName }}</span> v{{ upgradeInfo.oldVersion }}，
          将要安装 v{{ upgradeInfo.newVersion }}。
        </p>
        <p class="text-xs text-neutral-400 mb-4">是否确认更新？</p>
        <div class="flex justify-end gap-2">
          <button class="btn outline text-xs" @click="cancelUpgrade">取消</button>
          <button class="btn text-xs bg-primary-500 text-white hover:bg-primary-600" @click="confirmDoUpgrade">确认更新</button>
        </div>
      </div>
    </div>

    <!-- 卸载确认弹窗 -->
    <div v-if="confirmUninstall" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" @click.self="cancelUninstall">
      <div class="bg-white rounded-lg shadow-xl p-6 w-80">
        <h3 class="text-sm font-semibold mb-2">确认卸载</h3>
        <p class="text-xs text-neutral-500 mb-4">
          确定要卸载此插件吗？相关的桌面组件窗口和推流服务将被关闭。
        </p>
        <div class="flex justify-end gap-2">
          <button class="btn outline text-xs" @click="cancelUninstall">取消</button>
          <button class="btn text-xs bg-red-500 text-white hover:bg-red-600" @click="doUninstall">确认卸载</button>
        </div>
      </div>
    </div>
  </PageContainer>
</template>
