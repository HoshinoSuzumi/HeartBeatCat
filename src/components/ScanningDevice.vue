<script lang="ts" setup>
import { computed, PropType } from 'vue';
import { Device, useHrcatStore } from '../stores';

const props = defineProps({
  device: {
    type: Object as PropType<Device>,
    required: true
  },
  isKnown: {
    type: Boolean,
    default: false
  },
  isConnecting: {
    type: Boolean,
    default: false
  }
});
const emit = defineEmits(['connect']);
const store = useHrcatStore();

const displayAddress = computed(() => {
  return props.device.address === '00:00:00:00:00:00' ? (props.device.peripheral_id || 'N/A') : props.device.address;
})
</script>

<template>
  <div class="item w-full px-3 py-3 flex justify-between items-center bg-white rounded" :key="device.peripheral_id">
    <div class="h-full">
      <div class="flex flex-col gap-1">
        <span class="flex items-center gap-1 text-sm leading-none">
          {{ device.name }}
        </span>
        <span class="flex items-center gap-1 text-2xs text-neutral-400">
          <SignalIndicator :rssi="device.rssi" />
          <span class="font-mono">{{ displayAddress }}</span>
        </span>
      </div>
    </div>
    <div class="h-full flex items-center">
      <SvgSpinnersPulse2 v-if="isConnecting" class="icon text-lg text-primary" />
      <button v-else class="btn outline" :disabled="store.is_connected" @click="emit('connect', device.peripheral_id)">连接</button>
    </div>
  </div>
</template>

<style scoped>
.item {
  border: 1px solid rgb(220, 220, 220);
  box-shadow: 2px 2px 6px -2px rgba(200, 200, 200, 0.385);
}
</style>
