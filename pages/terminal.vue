<script setup lang="ts">
// The terminal is now embedded in each SAN's system-config page (Terminal tab).
// Redirect to /admin/sans so the user can pick the right SAN.
const sanSelector = useSelectedSan()
const san = sanSelector.effective.value ?? sanSelector.activeSans.value[0]
if (san) {
  await navigateTo(`/admin/sans/${san.id}/system-config?tab=terminal`, { replace: true })
} else {
  await navigateTo('/admin/sans', { replace: true })
}
</script>

<template>
  <div />
</template>
