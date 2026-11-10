<script setup lang="ts">
import { ref } from 'vue'

const api = window.code4x
const pong = ref('')
const echoInput = ref('')
const echoOutput = ref('')
const error = ref('')

async function ping() {
  error.value = ''
  pong.value = await api.ping()
}

async function echo() {
  error.value = ''
  echoOutput.value = ''
  try {
    echoOutput.value = await api.echo(echoInput.value)
  } catch (caught) {
    // 只有 `message` 会跨越 IPC 边界；preload 在这里将它重新抛出。
    error.value = caught instanceof Error ? caught.message : String(caught)
  }
}
</script>

<template>
  <main>
    <h1>{PROJECT}</h1>
    <p>A Vite+ Electron app: the Vue renderer talks to the main process over IPC.</p>
    <ul>
      <li>Electron {{ api.versions.electron }}</li>
      <li>Node {{ api.versions.node }}</li>
      <li>Chromium {{ api.versions.chrome }}</li>
      <li>Platform {{ api.platform }}</li>
    </ul>
    <button type="button" @click="ping">Ping main process</button>
    <p v-if="pong">main process says: {{ pong }}</p>
    <p>
      <input v-model="echoInput" placeholder="echo (leave empty to see a validation error)" />
      <button type="button" @click="echo">Echo</button>
    </p>
    <p v-if="echoOutput">main process echoed: {{ echoOutput }}</p>
    <p v-if="error">error: {{ error }}</p>
  </main>
</template>
