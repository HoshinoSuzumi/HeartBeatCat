<script lang="ts" setup>
import { ref, watch, computed } from 'vue'
import UiNumberInput from './UiNumberInput.vue'
import UiSelect from './UiSelect.vue'
import UiTextInput from './UiTextInput.vue'
import UiToggle from './UiToggle.vue'

interface SchemaProperty {
  type: string
  title?: string
  default?: unknown
  enum?: (string | number)[]
  enumLabels?: string[]
  minimum?: number
  maximum?: number
}

interface JsonSchema {
  type: string
  properties?: Record<string, SchemaProperty>
}

const props = defineProps<{
  schema: JsonSchema
  config: Record<string, unknown>
}>()

const emit = defineEmits<{
  (e: 'update', config: Record<string, unknown>): void
}>()

// 本地编辑副本
const localConfig = ref<Record<string, unknown>>({})

watch(
  () => props.config,
  (val) => {
    localConfig.value = { ...val }
    // 补全默认值
    if (props.schema.properties) {
      for (const [key, prop] of Object.entries(props.schema.properties)) {
        if (!(key in localConfig.value) && prop.default !== undefined) {
          localConfig.value[key] = prop.default
        }
      }
    }
  },
  { immediate: true },
)

const emitChange = () => {
  emit('update', { ...localConfig.value })
}

const updateField = (key: string, value: unknown) => {
  localConfig.value[key] = value
  emitChange()
}

const properties = computed(() => {
  if (!props.schema.properties) return []
  return Object.entries(props.schema.properties).map(([key, prop]) => ({
    key,
    ...prop,
  }))
})

const hasEnum = (prop: SchemaProperty) => Array.isArray(prop.enum) && prop.enum.length > 0
const isNumber = (prop: SchemaProperty) => prop.type === 'number' || prop.type === 'integer'
const isBoolean = (prop: SchemaProperty) => prop.type === 'boolean'
const selectValue = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? value : undefined
const numberValue = (value: unknown) => typeof value === 'number' ? value : undefined
const optionsFor = (prop: SchemaProperty) => prop.enum?.map((value, index) => ({
  value,
  label: prop.enumLabels?.[index] ?? String(value),
})) ?? []
</script>

<template>
  <div class="space-y-3" v-if="properties.length > 0">
    <div v-for="(prop, index) in properties" :key="prop.key" class="flex flex-col gap-1">
      <label v-if="!isBoolean(prop)" :for="`plugin-setting-${index}`" class="text-xs font-medium text-neutral-600">{{ prop.title ?? prop.key }}</label>

      <UiSelect
        v-if="hasEnum(prop)"
        :id="`plugin-setting-${index}`"
        :label="prop.title ?? prop.key"
        :options="optionsFor(prop)"
        :model-value="selectValue(localConfig[prop.key])"
        @update:model-value="updateField(prop.key, $event)"
      />

      <UiNumberInput
        v-else-if="isNumber(prop)"
        :id="`plugin-setting-${index}`"
        :label="prop.title ?? prop.key"
        :min="prop.minimum"
        :max="prop.maximum"
        :step="prop.type === 'integer' ? 1 : 'any'"
        :model-value="numberValue(localConfig[prop.key])"
        @update:model-value="updateField(prop.key, $event)"
      />

      <div v-else-if="isBoolean(prop)" class="flex min-h-8 items-center justify-between gap-3">
        <span class="text-xs font-medium text-neutral-600">{{ prop.title ?? prop.key }}</span>
        <UiToggle
          :label="prop.title ?? prop.key"
          :model-value="!!localConfig[prop.key]"
          @update:model-value="updateField(prop.key, $event)"
        />
      </div>

      <UiTextInput
        v-else
        :id="`plugin-setting-${index}`"
        :label="prop.title ?? prop.key"
        :model-value="String(localConfig[prop.key] ?? '')"
        @update:model-value="updateField(prop.key, $event)"
      />
    </div>
  </div>
  <div v-else class="text-xs text-neutral-400">
    此插件没有可配置项
  </div>
</template>
