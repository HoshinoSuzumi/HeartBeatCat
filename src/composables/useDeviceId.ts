import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { BaseDirectory, exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const DEVICE_ID_PATH = "device_id.json";

const deviceId = ref<string | null>(null);
const username = ref<string | null>(null);
let initialized = false;

export function useDeviceId() {
  const init = async (): Promise<{ deviceId: string; username: string }> => {
    if (initialized && deviceId.value) {
      return { deviceId: deviceId.value, username: username.value ?? "" };
    }
    initialized = true;

    // 尝试读取已持久化的设备 ID
    try {
      if (await exists(DEVICE_ID_PATH, { baseDir: BaseDirectory.AppData })) {
        const raw = await readTextFile(DEVICE_ID_PATH, { baseDir: BaseDirectory.AppData });
        const parsed = JSON.parse(raw) as { deviceId: string };
        if (parsed.deviceId) {
          deviceId.value = parsed.deviceId;
        }
      }
    } catch {
      // 文件损坏或不存在，重新生成
    }

    // 如果没有持久化的 ID，生成新的
    if (!deviceId.value) {
      deviceId.value = crypto.randomUUID();
      try {
        await writeTextFile(DEVICE_ID_PATH, JSON.stringify({ deviceId: deviceId.value }), {
          baseDir: BaseDirectory.AppData,
        });
      } catch (e) {
        console.error("Failed to persist device ID:", e);
      }
    }

    // 获取系统用户名
    try {
      username.value = await invoke<string>("get_system_username");
    } catch {
      username.value = "";
    }

    return { deviceId: deviceId.value, username: username.value };
  };

  return { deviceId, username, init };
}
