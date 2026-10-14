<script setup lang="ts">
import { ref } from 'vue'

const api = window.code4x
const pong = ref('')

async function ping() {
  pong.value = await api.ping()
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
  </main>
</template>
