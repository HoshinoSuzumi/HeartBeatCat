<script setup lang="ts">
defineProps<{
  modelValue: boolean
  label: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-label="label"
    :aria-checked="modelValue"
    class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
    :class="modelValue ? 'bg-primary-500' : 'bg-neutral-200'"
    @click="emit('update:modelValue', !modelValue)"
  >
    <span
      aria-hidden="true"
      class="h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
      :class="modelValue ? 'translate-x-[18px]' : 'translate-x-0.5'"
    />
  </button>
</template>
