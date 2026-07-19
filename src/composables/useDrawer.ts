import { ref } from "vue"

const isOpen = ref(false)

export function useHistoryDrawer() {
  function open() {
    isOpen.value = true
  }
  function close() {
    isOpen.value = false
  }
  return { isOpen, open, close }
}
