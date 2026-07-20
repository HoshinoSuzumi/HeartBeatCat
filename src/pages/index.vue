<script lang="ts" setup>
import { invoke } from '@tauri-apps/api/core';
import { useRouter } from 'vue-router';
import { useBrcatStore } from '../stores';
import { useHistoryDrawer } from '../composables/useDrawer';
import { computed, onMounted, ref } from 'vue';
import { useSnackbar } from 'vue3-snackbar';
import { useErrno } from '../composables/useErrno';

const store = useBrcatStore();
const router = useRouter();
const snackbar = useSnackbar();
const { open: openHistory } = useHistoryDrawer();
const is_connecting = ref(false);

const scanning_devices = computed(() => store.scanning_devices.filter(d => d.name !== 'Unknown'));

/** 已发现的已知设备（按 MAC 地址匹配） */
const knownScanningDevices = computed(() =>
  scanning_devices.value.filter(d => store.isKnownDevice(d))
);

/** 新发现设备 */
const newScanningDevices = computed(() =>
  scanning_devices.value.filter(d => !store.isKnownDevice(d))
);

const hasBothSections = computed(() =>
  knownScanningDevices.value.length > 0 && newScanningDevices.value.length > 0
);

// ── 仪表盘数据 ──
const currentBpm = computed(() => Number(store.current_heart_rate) || 0)

const bpmAssessment = computed(() => {
  const bpm = currentBpm.value
  if (bpm <= 0) return { label: '—', detail: '等待心率数据，请确保设备已正确佩戴' }
  if (bpm < 50) return { label: '心率偏低', detail: '运动员静息心率可低至 40–60 bpm（AHA），若无不适属正常' }
  if (bpm < 60) return { label: '心率偏低', detail: '低于 60 bpm 属心动过缓（AHA），睡眠或深度放松时常见' }
  if (bpm < 80) return { label: '心率理想', detail: '静息心率位于 60–80 bpm，反映良好的心血管状态（ESC）' }
  if (bpm <= 100) return { label: '心率正常', detail: '处于 60–100 bpm 正常静息区间（AHA）' }
  if (bpm <= 120) return { label: '心率偏高', detail: '超出正常静息范围，紧张、兴奋或咖啡因均可导致暂时升高' }
  return { label: '心率偏快', detail: '静息 > 120 bpm 属心动过速（AHA），持续偏高建议关注心脏健康' }
})

const tips = [
  { title: '静息心率', content: '成年人正常静息心率 60–100 bpm，长期低于 60 建议咨询医生。' },
  { title: '直播时长', content: '连续直播超过 45 分钟建议起身活动，有助于心率恢复平稳。' },
  { title: '补水提示', content: '轻微脱水即可使心率升高 5–10 bpm，桌边常备饮用水。' },
  { title: 'OBS 推流', content: '在「插件管理」中启用推流后，将推流地址填入 OBS 浏览器源即可。' },
  { title: '桌面组件', content: '启用组件后心率会显示在可拖动悬浮窗中，支持透明置顶。' },
  { title: '呼吸调节', content: '紧张时尝试 4-7-8 呼吸法：吸气 4 秒、屏息 7 秒、呼气 8 秒。' },
]

async function connect(peripheral_id: String) {
  is_connecting.value = true;
  store.stopScan();
  invoke('connect', { peripheralId: peripheral_id })
    .catch(errno => {
      snackbar.add({
        type: 'error',
        text: useErrno(errno),
      });
      store.startScan();
    }).finally(() => {
      setTimeout(() => {
        is_connecting.value = false;
      }, 500);
    });
}

onMounted(() => {
  store.startScan();
})
</script>

<template>
  <PageContainer title="设备连接" content-class="relative">
    <template #actions>
      <div class="flex">
        <button class="text-[var(--primary-color)]" v-if="!store.is_connected"
          @click="() => store.is_scanning ? store.stopScan() : store.startScan()">
          <TablerReload :class="{ 'animate-spin': store.is_scanning }" />
        </button>
      </div>
    </template>
    <Transition name="fade">
      <div v-if="store.is_connected" class="w-full h-full flex flex-col bg-white">
        <div class="px-4 pl-3.5 py-2 border-b flex justify-between items-center">
          <div class="flex items-center gap-1">
            <TablerBluetoothConnected class="icon text-lg text-emerald-500" />
            <span class="text-xs font-semibold text-neutral-500">已连接到 {{ store.connected_device?.name }}</span>
          </div>
          <button class="btn outline" @click="invoke('disconnect')">断开连接</button>
        </div>
        <div class="flex-1 overflow-auto px-3 py-3 flex flex-col gap-3">
          <!-- 实时心率 -->
          <div class="flex flex-col items-center py-3 rounded-xl bg-neutral-50/50">
            <div class="flex items-baseline gap-1">
              <span class="text-5xl font-bold tabular-nums text-primary-500">{{ currentBpm || '--' }}</span>
              <span class="text-sm text-neutral-400 font-medium">BPM</span>
            </div>
            <p class="text-2xs text-neutral-400 mt-1">{{ bpmAssessment.detail }}</p>
          </div>

          <!-- 功能入口 2×2 -->
          <div class="grid grid-cols-2 gap-2.5">
            <button class="entry group px-3 py-3 flex items-center gap-2.5 bg-white cursor-pointer transition active:scale-[0.98]"
              @click="router.push('/charts')">
              <span class="shrink-0 w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center group-hover:bg-primary-100 transition-colors">
                <TablerActivityHeartbeat class="icon text-xl text-primary-400" />
              </span>
              <div class="text-left min-w-0">
                <p class="text-xs font-semibold text-neutral-700 leading-none">心率图表</p>
                <p class="text-2xs text-neutral-400 mt-0.5 leading-none">实时曲线</p>
              </div>
            </button>

            <button class="entry group px-3 py-3 flex items-center gap-2.5 bg-white cursor-pointer transition active:scale-[0.98]"
              @click="router.push('/plugins')">
              <span class="shrink-0 w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center group-hover:bg-primary-100 transition-colors">
                <SolarWidget2BoldDuotone class="icon text-xl text-primary-400" />
              </span>
              <div class="text-left min-w-0">
                <p class="text-xs font-semibold text-neutral-700 leading-none">桌面小组件</p>
                <p class="text-2xs text-neutral-400 mt-0.5 leading-none">悬浮窗</p>
              </div>
            </button>

            <button class="entry group px-3 py-3 flex items-center gap-2.5 bg-white cursor-pointer transition active:scale-[0.98]"
              @click="router.push('/plugins')">
              <span class="shrink-0 w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center group-hover:bg-primary-100 transition-colors">
                <SolarPlayStreamBold class="icon text-xl text-primary-400" />
              </span>
              <div class="text-left min-w-0">
                <p class="text-xs font-semibold text-neutral-700 leading-none">OBS 推流插件</p>
                <p class="text-2xs text-neutral-400 mt-0.5 leading-none">浏览器源</p>
              </div>
            </button>

            <button class="entry group px-3 py-3 flex items-center gap-2.5 bg-white cursor-pointer transition active:scale-[0.98]"
              @click="openHistory">
              <span class="shrink-0 w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center group-hover:bg-primary-100 transition-colors">
                <TablerHistory class="icon text-xl text-primary-400" />
              </span>
              <div class="text-left min-w-0">
                <p class="text-xs font-semibold text-neutral-700 leading-none">心率记录</p>
                <p class="text-2xs text-neutral-400 mt-0.5 leading-none">历史回放</p>
              </div>
            </button>
          </div>

          <!-- 小贴士 -->
          <div class="mt-0.5">
            <span class="block text-xs font-semibold text-neutral-500 px-1 mb-1.5">小贴士</span>
            <TipsCarousel :tips="tips" :interval="4000" />
          </div>
        </div>
      </div>
      <div v-else-if="store.is_scanning && scanning_devices.length === 0"
        class="w-full h-full flex flex-col gap-4 justify-center items-center">
        <SvgSpinnersPulse2 class="icon text-5xl text-neutral-400" />
        <span class="text-sm font-semibold text-neutral-400">正在扫描蓝牙设备</span>
      </div>
      <div v-else-if="is_connecting" class="w-full h-full flex flex-col gap-4 justify-center items-center">
        <SvgSpinnersWifiFade class="icon text-5xl text-neutral-400" />
        <span class="text-sm font-semibold text-neutral-400">正在连接到设备</span>
      </div>
      <div class="p-4" v-else>
        <div class="flex flex-col" :class="hasBothSections ? 'gap-6' : 'gap-2'">
          <!-- 已知设备 -->
          <div v-if="knownScanningDevices.length > 0">
            <div class="flex items-center gap-1.5 mb-2 px-1">
              <TablerHistory class="icon text-sm text-primary-500" />
              <span class="text-xs font-semibold text-neutral-500">已知设备</span>
            </div>
            <TransitionGroup name="scan-device" tag="div" class="flex flex-col gap-2">
              <ScanningDevice v-for="device in knownScanningDevices"
                :key="device.peripheral_id" :device="device" :is-known="true"
                :is-connecting="store.autoConnectingAddress === device.address"
                @connect="connect" />
            </TransitionGroup>
          </div>
          <!-- 发现设备 -->
          <div v-if="newScanningDevices.length > 0">
            <div class="flex items-center gap-1.5 mb-2 px-1">
              <TablerSearch class="icon text-sm text-neutral-400" />
              <span class="text-xs font-semibold text-neutral-500">发现设备</span>
            </div>
            <TransitionGroup name="scan-device" tag="div" class="flex flex-col gap-2">
              <ScanningDevice v-for="device in newScanningDevices"
                :key="device.peripheral_id" :device="device"
                :is-connecting="store.autoConnectingAddress === device.address"
                @connect="connect" />
            </TransitionGroup>
          </div>
        </div>
      </div>
    </Transition>
  </PageContainer>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-leave-active {
  transition: transform 0.3s;
  position: absolute;
  inset: 0;
}

.scan-device-enter-active,
.scan-device-leave-active {
  transition: opacity 0.3s;
}

.scan-device-enter-from,
.scan-device-leave-to {
  opacity: 0;
}

.scan-device-move {
  transition: transform 0.3s;
}

.entry {
  border: 1px solid rgb(235, 235, 235);
  border-radius: 0.75rem;
}
.entry:hover {
  border-color: var(--primary-color);
  box-shadow: 0 1px 4px rgba(250, 58, 123, 0.08);
}
</style>
