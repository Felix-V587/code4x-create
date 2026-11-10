<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from 'reka-ui'
</script>

<template>
  <DialogRoot>
    <DialogTrigger class="reka-trigger">打开对话框</DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="reka-overlay" />
      <DialogContent class="reka-content">
        <DialogTitle class="reka-title">Reka UI</DialogTitle>
        <DialogDescription class="reka-description">
          无样式、可访问的 Vue 组件原语。
        </DialogDescription>
        <DialogClose class="reka-close">关闭</DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.reka-trigger {
  padding: 0.5rem 0.9rem;
  border: 1px solid #d4d4d8;
  border-radius: 0.5rem;
  background: #fff;
  color: #18181b;
  cursor: pointer;
}

.reka-overlay {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 45%);
}

.reka-content {
  position: fixed;
  top: 50%;
  left: 50%;
  width: min(90vw, 24rem);
  padding: 1.25rem;
  border-radius: 0.75rem;
  background: #fff;
  color: #18181b;
  transform: translate(-50%, -50%);
}

.reka-title {
  margin: 0 0 0.5rem;
  font-size: 1.125rem;
}

.reka-description {
  margin: 0 0 1rem;
  color: #52525b;
}

.reka-close {
  padding: 0.4rem 0.8rem;
  border: 1px solid #d4d4d8;
  border-radius: 0.5rem;
  background: #f4f4f5;
  cursor: pointer;
}
</style>
