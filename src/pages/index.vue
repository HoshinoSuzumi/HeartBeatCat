<script lang="ts" setup>
import { invoke } from '@tauri-apps/api/core';
import { useBrcatStore } from '../stores';
import { computed, onMounted, ref } from 'vue';
import { useSnackbar } from 'vue3-snackbar';
import { useErrno } from '../composables/useErrno';

const store = useBrcatStore();
const snackbar = useSnackbar();
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
        <div class="flex-1 flex flex-col justify-center items-center px-4 py-2 gap-2">
          <img src="/favicon_256.ico" class="w-40 aspect-square opacity-30" />
          <!-- TODO: Features entry (grid) -->
          <div class="w-7/12 grid-cols-2 gap-4 hidden">

            <div
              class="p-3 pr-6 flex items-center justify-between gap-2 rounded-lg shadow-sm hover:shadow-md cursor-pointer transition bg-gradient-to-br from-neutral-50 to-primary-100">
              <TablerHeartbeat class="text-primary text-5xl opacity-80 bg-primary-100 p-2 rounded-xl" />
              <span class="text-lg text-primary-400 pl-1">心率</span>
            </div>

            <div
              class="p-3 pr-6 flex items-center justify-between gap-2 rounded-lg shadow-sm hover:shadow-md cursor-pointer transition bg-gradient-to-br from-neutral-50 to-primary-100">
              <TablerHeartbeat class="text-primary text-5xl opacity-80 bg-primary-100 p-2 rounded-xl" />
              <span class="text-lg text-primary-400 pl-1">心率</span>
            </div>

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
                :key="device.peripheral_id" :device="device" :is-known="true" @connect="connect" />
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
                :key="device.peripheral_id" :device="device" @connect="connect" />
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
</style>
