<script setup lang="ts">
defineProps<{
  modelValue?: string
  label: string
  id?: string
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <input
    :id="id"
    type="text"
    class="ui-field"
    :aria-label="label"
    :placeholder="placeholder"
    :disabled="disabled"
    :value="modelValue ?? ''"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
