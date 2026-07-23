import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createPinia } from "pinia";
import { SnackbarService } from "vue3-snackbar";
import gsap from "gsap";
import "vue3-snackbar/styles";
import * as Sentry from "@sentry/vue";
import { invoke } from "@tauri-apps/api/core";
import pkg from "../package.json";

import App from "./App.vue";

const routes = [
  { path: "/", component: () => import("./pages/index.vue") },
  { path: "/charts", component: () => import("./pages/charts.vue") },
  { path: "/plugins", component: () => import("./pages/plugins.vue") },
  { path: "/settings", component: () => import("./pages/settings.vue") },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 全局禁用右键上下文菜单
document.addEventListener("contextmenu", (e) => e.preventDefault());

const pinia = createPinia();
const app = createApp(App);
app.config.globalProperties.$gsap = gsap;

const isProduction = import.meta.env.MODE === "production";

Sentry.init({
  app,
  dsn: "https://b76abcdc8e7dd7edf2f8d4182f6ddbc4@o4511782624559104.ingest.us.sentry.io/4511782632095744",
  release: `heartbeatcat@${pkg.version}`,
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration({ router }),
    Sentry.replayIntegration(),
  ],
  // Error Reporting
  sampleRate: 1.0,
  // Performance Monitoring
  tracesSampleRate: isProduction ? 0.1 : 1.0,
  // Session Replay
  replaysSessionSampleRate: isProduction ? 0.1 : 1.0,
  replaysOnErrorSampleRate: 1.0,
  // Logs
  enableLogs: true,
  // 忽略不需要关注的错误
  ignoreErrors: [
    // 浏览器扩展相关错误
    /NS_ERROR_FAILURE/,
    /chrome-extension:/,
    /moz-extension:/,
  ],
});

// 获取系统信息并设置 Sentry 设备/OS 上下文
invoke<{ os_name: string; os_version: string; arch: string; hostname: string; processor_count: number; manufacturer: string; model: string }>("get_system_info")
  .then((sysInfo) => {
    Sentry.setContext("os", {
      name: sysInfo.os_name,
      version: sysInfo.os_version,
    });
    Sentry.setContext("device", {
      manufacturer: sysInfo.manufacturer,
      model: sysInfo.model,
      arch: sysInfo.arch,
      hostname: sysInfo.hostname,
      screen_resolution: `${window.screen.width}x${window.screen.height}`,
      processor_count: sysInfo.processor_count,
      screen_width_pixels: window.screen.width,
      screen_height_pixels: window.screen.height,
      language: navigator.language,
    });
  })
  .catch(() => {
    // 降级：仅使用 Web API 获取基本信息
    Sentry.setContext("os", {
      name: navigator.platform,
    });
    Sentry.setContext("device", {
      screen_resolution: `${window.screen.width}x${window.screen.height}`,
      screen_width_pixels: window.screen.width,
      screen_height_pixels: window.screen.height,
      language: navigator.language,
    });
  });

app.use(router);
app.use(pinia);
app.use(SnackbarService);

app.mount("#app");
