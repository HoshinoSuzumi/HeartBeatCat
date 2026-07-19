import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createPinia } from "pinia";
import { SnackbarService } from "vue3-snackbar";
import "vue3-snackbar/styles";

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

const pinia = createPinia();
createApp(App).use(router).use(pinia).use(SnackbarService).mount("#app");
