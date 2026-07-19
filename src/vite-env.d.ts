/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

import type gsap from 'gsap'

declare module 'vue' {
  interface ComponentCustomProperties {
    $gsap: typeof gsap
  }
}
