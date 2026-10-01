<script lang="ts" setup>
import { ref, watch, computed } from 'vue'
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
</script>

<template>
  <div class="space-y-3" v-if="properties.length > 0">
    <div v-for="prop in properties" :key="prop.key" class="flex flex-col gap-1">
      <label v-if="!isBoolean(prop)" class="text-xs font-medium text-neutral-600">{{ prop.title ?? prop.key }}</label>

      <!-- string + enum → select -->
      <select
        v-if="hasEnum(prop)"
        class="text-xs border border-neutral-300 rounded px-2 py-1 bg-white"
        :value="localConfig[prop.key]"
        @change="localConfig[prop.key] = ($event.target as HTMLSelectElement).value; emitChange()"
      >
        <option v-for="(opt, index) in prop.enum" :key="String(opt)" :value="opt">{{ prop.enumLabels?.[index] ?? opt }}</option>
      </select>

      <!-- number / integer → input[number] -->
      <input
        v-else-if="isNumber(prop)"
        type="number"
        class="text-xs border border-neutral-300 rounded px-2 py-1"
        :min="prop.minimum"
        :max="prop.maximum"
        :value="localConfig[prop.key]"
        @input="localConfig[prop.key] = Number(($event.target as HTMLInputElement).value); emitChange()"
      />

      <!-- boolean → switch -->
      <div v-else-if="isBoolean(prop)" class="flex items-center justify-between gap-3">
        <span class="text-xs font-medium text-neutral-600">{{ prop.title ?? prop.key }}</span>
        <UiToggle
          :label="prop.title ?? prop.key"
          :model-value="!!localConfig[prop.key]"
          @update:model-value="localConfig[prop.key] = $event; emitChange()"
        />
      </div>

      <!-- default: text input -->
      <input
        v-else
        type="text"
        class="text-xs border border-neutral-300 rounded px-2 py-1"
        :value="localConfig[prop.key]"
        @input="localConfig[prop.key] = ($event.target as HTMLInputElement).value; emitChange()"
      />
    </div>
  </div>
  <div v-else class="text-xs text-neutral-400">
    此插件没有可配置项
  </div>
</template>
