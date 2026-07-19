<script lang="ts" setup>
import { useConfirmDialog } from '../composables/useConfirmDialog'
import DevOnly from '../components/DevOnly.vue'

const dialog = useConfirmDialog()

const testConfirm = async () => {
  const ok = await dialog.confirm({
    title: '测试确认',
    message: '这是一个普通确认对话框，点击确认返回 true，取消返回 false。',
    confirmText: '确认',
  })
  console.log('confirm result:', ok)
}

const testWarning = async () => {
  const ok = await dialog.warn({
    title: '测试警告',
    message: '这是一个警告对话框，用于需要用户注意但非破坏性的操作。',
    confirmText: '仍然继续',
  })
  console.log('warn result:', ok)
}

const testDanger = async () => {
  const ok = await dialog.danger({
    title: '测试危险操作',
    message: '这是一个危险操作对话框，用于不可逆的破坏性操作确认。按钮会以红色高亮显示。',
    confirmText: '确认删除',
  })
  console.log('danger result:', ok)
}
</script>

<template>
  <PageContainer title="设置">
    <div class="p-4 bg-white h-full overflow-y-auto space-y-6">

      <!-- 调试选项 -->
      <DevOnly>
        <section class="border border-amber-200 rounded-lg p-4 bg-amber-50/30">
          <h3 class="text-sm font-semibold text-amber-700 mb-1">调试选项</h3>
          <p class="text-xs text-amber-500 mb-3">仅在开发模式下显示，用于测试对话框效果。</p>
          <div class="flex flex-wrap gap-2">
            <button class="btn text-xs" @click="testConfirm">
              普通确认对话框
            </button>
            <button class="btn text-xs bg-amber-500 hover:bg-amber-600 border-amber-500" @click="testWarning">
              警告对话框
            </button>
            <button class="btn text-xs bg-red-500 hover:bg-red-600 border-red-500" @click="testDanger">
              危险操作对话框
            </button>
          </div>
        </section>
      </DevOnly>

      <!-- 占位：其他设置 -->
      <div class="flex justify-center items-center pt-8">
        <span class="text-sm text-neutral-400">更多设置即将推出</span>
      </div>

    </div>
  </PageContainer>
</template>

<style scoped></style>
