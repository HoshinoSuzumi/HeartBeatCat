<script setup lang="ts">
const props = defineProps<{
  modelValue?: number
  label: string
  id?: string
  min?: number
  max?: number
  step?: number | 'any'
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const onInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.value === '') return
  const value = Number(input.value)
  if (Number.isFinite(value)) emit('update:modelValue', value)
}

const onBlur = (event: FocusEvent) => {
  const input = event.target as HTMLInputElement
  if (input.value === '') input.value = props.modelValue === undefined ? '' : String(props.modelValue)
}
</script>

<template>
  <input
    :id="id"
    type="number"
    class="ui-field"
    :aria-label="label"
    :placeholder="placeholder"
    :disabled="disabled"
    :min="min"
    :max="max"
    :step="step"
    :value="modelValue"
    @input="onInput"
    @blur="onBlur"
  />
</template>
