import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createPinia } from "pinia";
import { SnackbarService } from "vue3-snackbar";
import gsap from "gsap";
import "vue3-snackbar/styles";
import * as Sentry from "@sentry/vue";
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

app.use(router);
app.use(pinia);
app.use(SnackbarService);

app.mount("#app");
