import { defineStore } from "pinia";
import { ref } from "vue";
import { BaseDirectory, exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

interface AppSettings {
  autoConnectEnabled: boolean;
}

const SETTINGS_PATH = "settings.json";

const DEFAULT_SETTINGS: AppSettings = {
  autoConnectEnabled: true,
};

export const useAppSettings = defineStore("settings", () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS });
  let _loaded = false;

  const _ensureLoaded = async () => {
    if (_loaded) return;
    _loaded = true;

    if (!(await exists(SETTINGS_PATH, { baseDir: BaseDirectory.AppData }))) {
      await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
      await writeTextFile(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 2), {
        baseDir: BaseDirectory.AppData,
      });
    }

    try {
      const raw = await readTextFile(SETTINGS_PATH, { baseDir: BaseDirectory.AppData });
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      settings.value = { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      settings.value = { ...DEFAULT_SETTINGS };
    }
  };

  const _persist = async () => {
    await writeTextFile(SETTINGS_PATH, JSON.stringify(settings.value, null, 2), {
      baseDir: BaseDirectory.AppData,
    });
  };

  const load = async () => {
    await _ensureLoaded();
  };

  const setAutoConnectEnabled = async (enabled: boolean) => {
    await _ensureLoaded();
    settings.value.autoConnectEnabled = enabled;
    await _persist();
  };

  return {
    settings,
    load,
    setAutoConnectEnabled,
  };
});
