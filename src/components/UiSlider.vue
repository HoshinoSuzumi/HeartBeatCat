<script setup lang="ts">
defineProps<{
  modelValue: number
  min: number
  max: number
  step: number
  label: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()
</script>

<template>
  <input
    type="range"
    class="w-full accent-primary-500"
    :aria-label="label"
    :min="min"
    :max="max"
    :step="step"
    :value="modelValue"
    @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
  />
</template>
