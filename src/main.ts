import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createPinia } from "pinia";
import { SnackbarService } from "vue3-snackbar";
import gsap from "gsap";
import "vue3-snackbar/styles";
import * as Sentry from "@sentry/vue";

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

Sentry.init({
  app,
  dsn: "https://b76abcdc8e7dd7edf2f8d4182f6ddbc4@o4511782624559104.ingest.us.sentry.io/4511782632095744",
  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/vue/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: []
  },
  integrations: [
    Sentry.browserTracingIntegration({ router }),
    Sentry.replayIntegration()
  ],
  // Tracing
  tracesSampleRate: 1.0, // Capture 100% of the transactions
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
  // Session Replay
  replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.,
  // Logs
  enableLogs: true,
  environment: import.meta.env.MODE,
});

app.use(router);
app.use(pinia);
app.use(SnackbarService);

app.mount("#app");
