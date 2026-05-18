<template>
  <div />
</template>

<script setup lang="ts">
definePageMeta({ layout: 'default' })
await navigateTo('/stats?tab=perf', { replace: true })
</script>
