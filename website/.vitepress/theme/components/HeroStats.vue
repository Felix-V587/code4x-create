<script setup>
const stats = [
  { n: "3", label: "框架基座" },
  { n: "21", label: "可选 feature" },
  { n: "9", label: "内置预设" },
  { n: "3", label: "验证层级" },
];
</script>

<template>
  <ul class="c4x-stats" aria-label="code4x 概览">
    <li v-for="s in stats" :key="s.label" class="c4x-stat">
      <span class="c4x-stat-n">{{ s.n }}</span>
      <span class="c4x-stat-l">{{ s.label }}</span>
    </li>
  </ul>
</template>
