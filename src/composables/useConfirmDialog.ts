import { reactive } from 'vue'

export interface ConfirmDialogOptions {
  title: string
  message: string
  type?: 'confirm' | 'warning' | 'danger'
  confirmText?: string
  cancelText?: string
}

interface DialogState {
  visible: boolean
  title: string
  message: string
  type: 'confirm' | 'warning' | 'danger'
  confirmText: string
  cancelText: string
  resolve: ((value: boolean) => void) | null
}

const state = reactive<DialogState>({
  visible: false,
  title: '',
  message: '',
  type: 'confirm',
  confirmText: '确认',
  cancelText: '取消',
  resolve: null,
})

export function useConfirmDialog() {
  const show = (options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      state.title = options.title
      state.message = options.message
      state.type = options.type ?? 'confirm'
      state.confirmText = options.confirmText ?? '确认'
      state.cancelText = options.cancelText ?? '取消'
      state.resolve = resolve
      state.visible = true
    })
  }

  const confirm = (options: ConfirmDialogOptions) => show(options)

  const warn = (options: Omit<ConfirmDialogOptions, 'type'>) =>
    show({ ...options, type: 'warning' })

  const danger = (options: Omit<ConfirmDialogOptions, 'type'>) =>
    show({ ...options, type: 'danger' })

  return { state, confirm, warn, danger, show }
}
