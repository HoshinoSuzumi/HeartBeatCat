<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Device, useBrcatStore } from './stores'
import { useSnackbar, Vue3Snackbar } from 'vue3-snackbar'
import { onBeforeMount, onMounted } from 'vue'
import { usePluginManager } from './stores/plugin'
import { useSessionStore } from './stores/session'
import { useOverlay } from './composables/useOverlay'
import { useHistoryDrawer } from './composables/useDrawer'
import SlideDrawer from './components/SlideDrawer.vue'
import HistoryList from './components/HistoryList.vue'
import SessionOverlay from './components/SessionOverlay.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import { window } from '@tauri-apps/api'
import { Menu } from '@tauri-apps/api/menu'
import { TrayIcon, TrayIconOptions } from '@tauri-apps/api/tray'
import { defaultWindowIcon } from '@tauri-apps/api/app'

const store = useBrcatStore()
const pluginMgr = usePluginManager()
const sessionStore = useSessionStore()
const overlay = useOverlay()
const historyDrawer = useHistoryDrawer()
const snackbar = useSnackbar()

invoke('register_central_events')

listen('device-discovered', (event) => {
  store.pushDevice(event.payload as Device)
})

listen('device-disconnected', (_) => {
  snackbar.add({
    type: 'warning',
    text: '设备已断开连接',
  })
  sessionStore.endSession()
})

listen('device-connected', (_) => {
  console.log("[App] device-connected 事件触发")
  sessionStore.startSession()
})

onMounted(() => {
  pluginMgr.refreshPlugins()
})

onBeforeMount(async () => {
  const mainWindow = (await window.getAllWindows()).find(
    (w) => w.label === 'main',
  )

  mainWindow?.onCloseRequested((event) => {
    event.preventDefault()
    mainWindow.hide()
  })

  const showMainWindow = async () => {
    if (mainWindow) {
      mainWindow.show()
      if (await mainWindow.isMinimized()) mainWindow.unminimize()
      if (!(await mainWindow.isFocused())) mainWindow.setFocus()
    } else {
      // await message('主窗口未找到，请重启应用', {
      //   title: '程序异常',
      //   kind: 'error',
      // })
    }
  }

  // tray menu
  const trayMenu = await Menu.new({
    items: [
      {
        id: 'show',
        text: '显示主窗口',
        action: async () => {
          await showMainWindow()
        },
      },
      {
        item: 'Separator',
      },
      {
        id: 'quit',
        text: '退出 HBCat',
        accelerator: 'CmdOrCtrl+Q',
        action: async () => {
          await sessionStore.endSession()
          await invoke('close_all_widgets')
          await mainWindow?.destroy()
        },
      },
    ],
  })

  // tray options
  const trayOptions: TrayIconOptions = {
    menu: trayMenu,
    id: 'hbcat',
    showMenuOnLeftClick: false,
    icon: (await defaultWindowIcon()) || undefined,
    tooltip: 'HeartBeat Cat',
    action: (event) => {
      switch (event.type) {
        case 'DoubleClick':
          showMainWindow()
          break
      }
    },
  }

  await TrayIcon.new(trayOptions)
})
</script>

<template>
  <div>
    <DrawerContainer>
      <RouterView v-slot="{ Component }">
        <Transition
          name="scale"
          mode="out-in"
        >
          <KeepAlive :exclude="['settings']">
            <component :is="Component" />
          </KeepAlive>
        </Transition>
      </RouterView>
    </DrawerContainer>
    <SlideDrawer :open="historyDrawer.isOpen.value" @close="historyDrawer.close()">
      <template #title>历史记录</template>
      <HistoryList />
    </SlideDrawer>
    <SessionOverlay
      v-if="overlay.state.type === 'session' && overlay.state.sessionId"
      :session-id="overlay.state.sessionId"
      @close="overlay.close()"
    />
    <Vue3Snackbar
      bottom
      right
      shadow
      dense
      :border="'left'"
      :duration="5000"
    ></Vue3Snackbar>
    <ConfirmDialog />
  </div>
</template>

<style>
@import './assets/css/font.css';
@import './assets/css/style.css';

:root {
  --primary-color: #f25e86;
  --app-background: #f8f8f8;

  --title-bar-background: #e4e4e4;
  --title-bar-color: var(--primary-color);
  --title-bar-height: 25px;

  --drawer-bar-background: #eeeeee;
  --drawer-bar-item-background: #eeeeee;
  --drawer-bar-item-active-background: var(--content-background);

  --content-background: var(--app-background);
}

::-webkit-scrollbar {
  --bar-width: 8px;
  width: var(--bar-width);
  height: var(--bar-width);
}

::-webkit-scrollbar-track {
  background-color: transparent;
}

::-webkit-scrollbar-thumb {
  --bar-color: rgba(0, 0, 0, 0.2);
  background-color: var(--bar-color);
  border-radius: 20px;
  background-clip: content-box;
  border: 1px solid transparent;
}

/* Scale */
.scale-enter-active,
.scale-leave-active {
  transition: all 200ms ease;
  -webkit-transition: all 200ms ease;
  -moz-transition: all 200ms ease;
  -ms-transition: all 200ms ease;
  -o-transition: all 200ms ease;
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.99);
  -webkit-transform: scale(0.99);
  -moz-transform: scale(0.99);
  -ms-transform: scale(0.99);
  -o-transform: scale(0.99);
}

html,
body {
  padding: 0;
  margin: 0;
}

body {
  font-family: Rubik, 'Noto Sans SC', sans-serif;
  font-weight: 400;
  background-color: var(--app-background);
  border-radius: 8px;
  overflow: hidden;
}

.titlebar {
  -webkit-user-select: none;
  user-select: none;
  -webkit-app-region: drag;
  position: fixed;
  z-index: 99;
  width: 100%;
  height: var(--title-bar-height);
  display: flex;
  flex-direction: row;
  align-items: center;
  padding: 0 8px;
  background-color: var(--title-bar-background);
  color: var(--title-bar-color);
  font-size: 12px;
  font-weight: bold;
  overflow: hidden;
}

.titlebar .icon {
  height: calc(var(--title-bar-height) - 6px);
}

#vue3-snackbar--container {
  margin: 8px 8px 0;
}

.vue3-snackbar-message-wrapper {
  width: 100%;
}

.vue3-snackbar-message.is-dense .vue3-snackbar-message-wrapper {
  padding: 6px 10px;
}

.vue3-snackbar-message {
  font-size: 14px !important;
  min-width: auto !important;
  max-width: 300px !important;
  margin-bottom: 8px;
}

.vue3-snackbar-message-icon {
  margin-right: 8px;
}

.vue3-snackbar-message-content {
  width: auto;
  margin-right: 8px;
}
</style>
