<script lang="ts" setup>
import { Window } from '@tauri-apps/api/window'
import { Webview } from '@tauri-apps/api/webview'
import { useSnackbar } from 'vue3-snackbar'
import { invoke } from '@tauri-apps/api/core'
import { PluginManifest, usePluginManager } from '../stores/plugin'
import { storeToRefs } from 'pinia'
import { getAllWebviewWindows } from '@tauri-apps/api/webviewWindow'
import { appDataDir, resolve } from '@tauri-apps/api/path'
import { openPath } from '@tauri-apps/plugin-opener'
import { onMounted } from 'vue'

const pluginMgr = usePluginManager()
const { plugins } = storeToRefs(pluginMgr)
const snackbar = useSnackbar()

const getWidgetWindowName = (plugin: PluginManifest) => {
  return `widget_${plugin.id}`
}

const syncPluginStates = async () => {
  const windows = await getAllWebviewWindows()
  const activeLabels = new Set(windows.map(w => w.label))
  plugins.value = plugins.value.map((p) => ({
    ...p,
    isActivated: activeLabels.has(getWidgetWindowName(p)),
  }))
}

const onActivateWidget = async (plugin: PluginManifest) => {
  // 检查窗口是否已存在，如果存在则仅同步状态
  const existingWindows = await getAllWebviewWindows()
  const label = getWidgetWindowName(plugin)
  if (existingWindows.some(w => w.label === label)) {
    plugins.value = plugins.value.map((p) => ({
      ...p,
      isActivated: p.id === plugin.id ? true : p.isActivated,
    }))
    return
  }

  const baseURL = await invoke<{
    builtin: string
    user: string
  }>('get_widget_url')

  console.log(baseURL)

  const url = `${plugin.isBuiltIn ? baseURL.builtin : baseURL.user}/${
    plugin.id
  }/${plugin.widgetMeta?.index}`

  console.log(url)

  const window = new Window(label, {
    width: plugin.widgetMeta?.width || 100,
    height: plugin.widgetMeta?.height || 100,
    resizable: false,
    decorations: false,
    transparent: true,
    shadow: false,
    alwaysOnTop: true,
    title: `HBCat 组件 - ${plugin.name}`,
  })

  window.once('tauri://created', () => {
    const webview = new Webview(window, label, {
      url,
      x: 0,
      y: 0,
      width: plugin.widgetMeta?.width || 100,
      height: plugin.widgetMeta?.height || 100,
      transparent: true,
      acceptFirstMouse: true,
    })
    plugins.value = plugins.value.map((p) => ({
      ...p,
      isActivated: p.id === plugin.id ? true : p.isActivated,
    }))
    webview.once('tauri://error', (e) => {
      snackbar.add({
        type: 'error',
        text: `创建 WebView 失败: ${e.payload}`,
      })
    })
  })
  window.once('tauri://error', (e) => {
    snackbar.add({
      type: 'error',
      text: `创建窗口失败: ${e.payload}`,
    })
  })
}

const onCloseWidget = async (plugin: PluginManifest) => {
  ;(await getAllWebviewWindows()).forEach((webview) => {
    if (webview.label === getWidgetWindowName(plugin)) {
      webview.destroy()
      plugins.value = plugins.value.map((p) => ({
        ...p,
        isActivated: p.id === plugin.id ? false : p.isActivated,
      }))
    }
  })
}

const onOpenPluginDir = async () => {
  const appDataDirPath = await appDataDir()
  const pluginDirPath = await resolve(
    appDataDirPath,
    'plugins'
  )

  openPath(pluginDirPath).catch((e) => {
    snackbar.add({
      type: 'error',
      text: `打开插件目录失败: ${e}`,
    })
  })
}

const onRefreshPlugins = async () => {
  await pluginMgr.refreshPlugins()
  await syncPluginStates()
}

onMounted(() => {
  syncPluginStates()
})
</script>

<template>
  <PageContainer title="桌面组件">
    <template #actions>
      <div class="flex items-center gap-2">
        <DevOnly>
          <button
            class="btn outline"
            @click="onRefreshPlugins"
          >
            刷新组件
          </button>
        </DevOnly>
        <button
          class="btn outline"
          @click="onOpenPluginDir"
        >
          打开插件目录
        </button>
      </div>
    </template>
    <div class="w-full h-full flex flex-col bg-white">
      <!-- <button
        class="btn"
        @click="createWindow"
      >
        Create Window
      </button> -->
      <!-- <button
        class="btn"
        @click="pluginMgr.refreshPlugins"
      >
        Refresh Plugins
      </button>
      <pre>{{ pluginMgr.plugins }}</pre> -->
      <div class="p-4">
        <div class="flex flex-col gap-2 relative">
          <WidgetListItem
            v-for="(plugin, i) in plugins"
            :key="i"
            :plugin
            @activate-widget="onActivateWidget"
            @close-widget="onCloseWidget"
          />
        </div>
      </div>
    </div>
  </PageContainer>
</template>

<style scoped></style>
