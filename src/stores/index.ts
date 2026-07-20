import { defineStore } from "pinia";
import { onMounted, ref, watchEffect } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useThrottleFn, useDebounceFn } from "@vueuse/core";
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useAppSettings } from "./settings";

export interface Device {
  peripheral_id: string;
  name: string;
  address: string;
  rssi: number;
}

/** 持久化的已知设备记录 */
interface KnownDeviceRecord {
  address: string;
  name: string;
  lastConnectedAt: number;
}

const KNOWN_DEVICES_PATH = "known_devices.json";

export const useBrcatStore = defineStore("brcat", () => {
  const scanning_devices = ref<Device[]>([]);

  const is_connected = ref(false);
  const connected_device = ref<Device | null>(null);

  const is_scanning = ref(false);

  const current_heart_rate = ref<Number>(0);

  // ── 已知设备管理 ──
  const knownDevices = ref<KnownDeviceRecord[]>([]);
  let _knownLoaded = false;
  let _autoConnectTriggered = false;

  /** 正在自动连接的设备地址（用于列表中显示加载状态） */
  const autoConnectingAddress = ref<string | null>(null);

  const _ensureKnownLoaded = async () => {
    if (_knownLoaded) return;
    _knownLoaded = true;
    if (!(await exists(KNOWN_DEVICES_PATH, { baseDir: BaseDirectory.AppData }))) {
      await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
      await writeTextFile(KNOWN_DEVICES_PATH, "[]", { baseDir: BaseDirectory.AppData });
    }
    try {
      const raw = await readTextFile(KNOWN_DEVICES_PATH, { baseDir: BaseDirectory.AppData });
      knownDevices.value = JSON.parse(raw) as KnownDeviceRecord[];
    } catch {
      knownDevices.value = [];
    }
  };

  const _persistKnownDevices = async () => {
    await writeTextFile(KNOWN_DEVICES_PATH, JSON.stringify(knownDevices.value, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
  };

  /** 判断设备是否为已知设备（通过 MAC 地址匹配） */
  const isKnownDevice = (device: Device): boolean => {
    return device.address !== "00:00:00:00:00:00"
      && knownDevices.value.some((k) => k.address === device.address);
  };

  /** 记录设备为已知设备 */
  const recordKnownDevice = async (device: Device) => {
    await _ensureKnownLoaded();
    if (device.address === "00:00:00:00:00:00") return;
    const existing = knownDevices.value.find((k) => k.address === device.address);
    if (existing) {
      existing.name = device.name;
      existing.lastConnectedAt = Date.now();
    } else {
      knownDevices.value.push({
        address: device.address,
        name: device.name,
        lastConnectedAt: Date.now(),
      });
    }
    await _persistKnownDevices();
  };

  /** 获取最后连接的已知设备地址 */
  const getLastConnectedAddress = async (): Promise<string | null> => {
    await _ensureKnownLoaded();
    if (knownDevices.value.length === 0) return null;
    const sorted = [...knownDevices.value].sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
    return sorted[0].address;
  };

  /** 尝试自动连接到扫描中出现的已知设备 */
  const tryAutoConnect = async (device: Device) => {
    if (_autoConnectTriggered || is_connected.value) return;

    const appSettings = useAppSettings();
    await appSettings.load();
    if (!appSettings.settings.autoConnectEnabled) return;

    const lastAddr = await getLastConnectedAddress();
    if (lastAddr && device.address === lastAddr) {
      _autoConnectTriggered = true;
      autoConnectingAddress.value = device.address;
      console.log("[Store] 自动连接已知设备:", device.name);
      stopScan();
      invoke("connect", { peripheralId: device.peripheral_id }).catch((errno) => {
        console.error("[Store] 自动连接失败:", errno);
        _autoConnectTriggered = false;
        autoConnectingAddress.value = null;
        startScan();
      });
    }
  };

  const resetAutoConnectFlag = () => {
    _autoConnectTriggered = false;
    autoConnectingAddress.value = null;
  };

  const resetCurrentHeartRate = useDebounceFn(() => {
    current_heart_rate.value = 0;
  }, 6000);

  onMounted(async () => {
    const unlisten = await listen("heart-rate", (heart_rate) => {
      resetCurrentHeartRate();
      current_heart_rate.value = heart_rate.payload as Number;
    });

    return unlisten;
  });

  setInterval(async () => {
    is_connected.value = await invoke("is_connected");
  }, 500);

  watchEffect(async () => {
    scanning_devices.value = [];
    if (is_connected.value) {
      connected_device.value = await invoke("get_connected_device");
    } else {
      connected_device.value = null;
      is_scanning.value = false;
      setTimeout(() => {
        startScan();
      }, 500);
    }
    stopScan();
  });

  const throttledSort = useThrottleFn(() => {
    scanning_devices.value = scanning_devices.value.sort(
      (a, b) => Math.round(b.rssi / 10) - Math.round(a.rssi / 10)
    );
  }, 2000);

  function pushDevice(device: Device) {
    // 自动连接检查（在设备首次出现时触发）
    tryAutoConnect(device);

    if (scanning_devices.value.some((d) => d.peripheral_id === device.peripheral_id)) {
      scanning_devices.value = scanning_devices.value.map((d) =>
        d.peripheral_id === device.peripheral_id ? device : d
      );
    } else {
      scanning_devices.value.push(device);
    }

    throttledSort();
  }

  function startScan() {
    invoke("start_scan");
    is_scanning.value = true;
  }

  function stopScan() {
    invoke("stop_scan");
    is_scanning.value = false;
  }

  return {
    current_heart_rate,
    is_connected,
    is_scanning,
    connected_device,
    scanning_devices,
    knownDevices,
    autoConnectingAddress,
    pushDevice,
    startScan,
    stopScan,
    isKnownDevice,
    recordKnownDevice,
    resetAutoConnectFlag,
  };
});
