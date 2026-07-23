import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  build: {
    sourcemap: 'hidden' as const,
  },
  plugins: [
    vue(),
    Components({
      dts: true,
    }),
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: "rayinesoft",
      project: "heartbeatcat",
      sourcemaps: {
        filesToDeleteAfterUpload: [
          "./**/*.map",
          ".*/**/public/**/*.map",
          "./dist/**/client/**/*.map",
        ],
      },
    }),
  ],
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
