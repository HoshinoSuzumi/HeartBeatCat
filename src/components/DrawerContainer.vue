<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useBrcatStore } from '../stores';
import MarqueeText from './MarqueeText.vue';

const store = useBrcatStore();

const deviceName = computed(() =>
  store.is_connected ? (store.connected_device?.name ?? '') : '未连接'
)

const navList = ref([
  { title: '设备连接', path: '/' },
  { title: '心率曲线', path: '/charts' },
  { title: '插件管理', path: '/plugins' },
  { title: '设置', path: '/settings' },
])
</script>

<template>
  <div class="drawer">
    <div class="side">
      <div class="nav">
        <router-link v-for="item in navList" :key="item.path" :to="item.path" class="nav-item" active-class="active">
          <span>{{ item.title }}</span>
        </router-link>
      </div>
      <div>
        <Transition name="indicator" mode="out-in">
          <div v-if="store.is_connected"
            class="flex px-2 py-0.5 gap-1 justify-between items-center bg-neutral-200 border-b border-neutral-300">
            <span class="inline-flex items-center gap-0.5 text-2xl text-primary font-bold">
              <TablerActivityHeartbeat class="text-base" />
              {{ store.current_heart_rate || '--' }}
            </span>
            <span class="flex flex-col gap-0.5 text-neutral-400">
              <span class="flex items-center gap-1 text-xs leading-none">
                <TablerCaretUpFilled />
                <span>{{ '--' }}</span>
              </span>
              <span class="flex items-center gap-1 text-xs leading-none">
                <TablerCaretDownFilled />
                <span>{{ '--' }}</span>
              </span>
            </span>
          </div>
        </Transition>
        <div class="status">
          <TablerBluetoothConnected v-if="store.is_connected" class="icon text-sm block -mt-0.5 text-emerald-500" />
          <TablerBluetooth v-else class="icon text-sm block -mt-0.5 text-neutral-400" />
          <MarqueeText :text="deviceName" />
        </div>
      </div>
    </div>
    <div class="content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.indicator-enter-active,
.indicator-leave-active {
  @apply transition-all duration-150;
}

.indicator-enter-from,
.indicator-leave-to {
  @apply opacity-0 translate-y-4;
}

.drawer {
  background-color: var(--app-background);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg id='hexagons' fill='%23ccc' fill-opacity='0.1' fill-rule='nonzero'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
  @apply w-full h-screen flex;

  .side {
    background-color: var(--drawer-bar-background);
    @apply w-[120px] flex flex-col overflow-hidden;

    .nav {
      @apply flex-1 flex flex-col;

      .nav-item {
        background-color: var(--drawer-bar-item-background);
        @apply flex justify-center items-center px-1 h-11 text-xs text-neutral-500 font-semibold transition-colors duration-150;

        &.active {
          /* background-color: var(--drawer-bar-item-active-background); */
          @apply text-primary-400 border-l-4 border-primary-400 bg-primary-400/10 pl-0;
        }
      }
    }

    .status {
      @apply w-full h-8 bg-neutral-200 flex items-center text-neutral-900 px-2 text-2xs whitespace-nowrap flex-nowrap;
    }
  }

  .content {
    @apply flex-1;
  }
}
</style>
