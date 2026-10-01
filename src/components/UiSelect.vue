<script lang="ts">
let nextSelectId = 0
</script>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'

interface Option {
  value: string | number
  label: string
}

const props = defineProps<{
  modelValue?: string | number
  options: Option[]
  label: string
  id?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
}>()

const generatedId = `ui-select-${++nextSelectId}`
const controlId = computed(() => props.id ?? generatedId)
const menuId = computed(() => `${controlId.value}-menu`)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const activeIndex = ref(-1)
const menuStyle = ref<Record<string, string>>({})

const selectedIndex = computed(() => props.options.findIndex(option => Object.is(option.value, props.modelValue)))
const selectedLabel = computed(() => props.options[selectedIndex.value]?.label ?? '请选择')

const positionMenu = () => {
  if (!trigger.value) return
  const rect = trigger.value.getBoundingClientRect()
  const below = window.innerHeight - rect.bottom - 8
  const above = rect.top - 8
  const expectedHeight = Math.min(240, props.options.length * 34 + 8)
  const placeAbove = below < expectedHeight && above > below
  const available = Math.max(40, (placeAbove ? above : below) - 4)
  const height = Math.min(240, available)
  menuStyle.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`,
    top: `${placeAbove ? Math.max(8, rect.top - Math.min(expectedHeight, height) - 4) : rect.bottom + 4}px`,
    width: `${rect.width}px`,
    maxHeight: `${height}px`,
    transformOrigin: placeAbove ? 'bottom center' : 'top center',
    '--ui-select-motion-offset': placeAbove ? '4px' : '-4px',
  }
}

const onOutsidePointerDown = (event: PointerEvent) => {
  const target = event.target as Node
  if (!trigger.value?.contains(target) && !menu.value?.contains(target)) closeMenu()
}

const addListeners = () => {
  document.addEventListener('pointerdown', onOutsidePointerDown)
  window.addEventListener('scroll', positionMenu, true)
  window.addEventListener('resize', positionMenu)
}

const removeListeners = () => {
  document.removeEventListener('pointerdown', onOutsidePointerDown)
  window.removeEventListener('scroll', positionMenu, true)
  window.removeEventListener('resize', positionMenu)
}

const scrollActiveIntoView = async () => {
  await nextTick()
  menu.value?.querySelector<HTMLElement>(`[data-option-index="${activeIndex.value}"]`)
    ?.scrollIntoView({ block: 'nearest' })
}

function openMenu() {
  if (props.disabled || props.options.length === 0 || isOpen.value) return
  activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0
  positionMenu()
  isOpen.value = true
  addListeners()
  void scrollActiveIntoView()
}

function closeMenu() {
  if (!isOpen.value) return
  isOpen.value = false
  removeListeners()
}

const choose = (index: number) => {
  const option = props.options[index]
  if (!option) return
  emit('update:modelValue', option.value)
  closeMenu()
  trigger.value?.focus()
}

const moveActive = (index: number) => {
  if (props.options.length === 0) return
  if (!isOpen.value) openMenu()
  activeIndex.value = Math.max(0, Math.min(props.options.length - 1, index))
  void scrollActiveIntoView()
}

const onKeydown = (event: KeyboardEvent) => {
  if (props.disabled) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!isOpen.value) openMenu()
    else moveActive(activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1))
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    moveActive(event.key === 'Home' ? 0 : props.options.length - 1)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (isOpen.value) choose(activeIndex.value)
    else openMenu()
  } else if (event.key === 'Escape') {
    if (isOpen.value) {
      event.preventDefault()
      closeMenu()
    }
  } else if (event.key === 'Tab') {
    closeMenu()
  }
}

watch(() => props.disabled, disabled => { if (disabled) closeMenu() })
watch(() => props.modelValue, () => {
  if (isOpen.value) activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0
})
watch(() => props.options, () => {
  if (isOpen.value) {
    activeIndex.value = selectedIndex.value >= 0 ? selectedIndex.value : 0
    positionMenu()
  }
})
onUnmounted(removeListeners)
</script>

<template>
  <button
    :id="controlId"
    ref="trigger"
    type="button"
    role="combobox"
    aria-haspopup="listbox"
    :aria-label="label"
    :aria-expanded="isOpen"
    :aria-controls="menuId"
    :aria-activedescendant="isOpen && activeIndex >= 0 ? `${menuId}-option-${activeIndex}` : undefined"
    :disabled="disabled || options.length === 0"
    class="ui-field flex items-center justify-between gap-2 text-left"
    @click="isOpen ? closeMenu() : openMenu()"
    @keydown="onKeydown"
  >
    <span class="truncate" :class="selectedIndex < 0 ? 'text-neutral-400' : ''">{{ selectedLabel }}</span>
    <svg aria-hidden="true" class="h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform" :class="isOpen ? 'rotate-180' : ''" viewBox="0 0 16 16" fill="none">
      <path d="m3.5 6 4.5 4 4.5-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>

  <Teleport to="body">
    <Transition name="ui-select-menu">
      <div
        v-if="isOpen"
        :id="menuId"
        ref="menu"
        role="listbox"
        :aria-label="label"
        class="ui-select-menu-surface fixed z-[1000] rounded-lg bg-white"
        :style="menuStyle"
      >
        <div class="overflow-y-auto rounded-lg p-1" :style="{ maxHeight: menuStyle.maxHeight }">
          <button
            v-for="(option, index) in options"
            :id="`${menuId}-option-${index}`"
            :key="`${String(option.value)}-${index}`"
            type="button"
            role="option"
            tabindex="-1"
            :data-option-index="index"
            :aria-selected="index === selectedIndex"
            class="flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-xs transition-colors"
            :class="index === activeIndex ? 'bg-primary-50 text-primary-700' : 'text-neutral-700 hover:bg-neutral-50'"
            @mouseenter="activeIndex = index"
            @click="choose(index)"
          >
            <span class="truncate">{{ option.label }}</span>
            <svg v-if="index === selectedIndex" aria-hidden="true" class="h-3.5 w-3.5 shrink-0 text-primary-500" viewBox="0 0 16 16" fill="none">
              <path d="m3 8 3.2 3.2L13 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-select-menu-surface {
  box-shadow: 0 3px 10px rgb(38 23 30 / 12%), 0 10px 24px rgb(38 23 30 / 8%);
}

.ui-select-menu-surface::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid rgb(83 65 73 / 12%);
  border-radius: inherit;
  pointer-events: none;
}

.ui-select-menu-enter-active {
  transition: opacity 150ms ease-out, transform 150ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ui-select-menu-leave-active {
  pointer-events: none;
  transition: opacity 110ms ease-in, transform 110ms ease-in;
}

.ui-select-menu-enter-from,
.ui-select-menu-leave-to {
  opacity: 0;
  transform: translateY(var(--ui-select-motion-offset)) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .ui-select-menu-enter-active,
  .ui-select-menu-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
