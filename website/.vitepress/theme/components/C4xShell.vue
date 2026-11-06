<script setup>
import DefaultTheme from "vitepress/theme";
import HeroStats from "./HeroStats.vue";
import PlanBand from "./PlanBand.vue";

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #home-hero-info-before>
      <div class="c4x-hero-grid" aria-hidden="true"></div>
    </template>
    <template #home-hero-actions-after><HeroStats /></template>
    <template #home-features-after><PlanBand /></template>
  </Layout>
</template>
