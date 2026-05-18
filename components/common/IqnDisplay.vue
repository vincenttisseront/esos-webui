<template>
  <UTooltip :text="iqn" :popper="{ placement: 'top' }">
    <span
      class="font-mono text-sm truncate cursor-default"
      :class="{ 'max-w-xs': !full }"
      :title="iqn"
    >
      {{ displayText }}
    </span>
  </UTooltip>
</template>

<script setup lang="ts">
const props = defineProps<{
  iqn: string
  full?: boolean
  short?: boolean
}>()

const displayText = computed(() => {
  if (props.full) return props.iqn

  // FC WWN: xx:xx:xx:xx:xx:xx:xx:xx
  const isWWN = /^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){7}$/.test(props.iqn)
  if (isWWN) {
    if (props.short) {
      // Last 2 octets
      const parts = props.iqn.split(':')
      return `…:${parts.slice(-2).join(':')}`
    }
    // First octet + last 4 octets
    const parts = props.iqn.split(':')
    return `${parts[0]}:…:${parts.slice(-4).join(':')}`
  }

  // iSCSI IQN
  if (props.short) {
    const tail = props.iqn.split(':').pop()
    return tail ?? props.iqn
  }
  const colonIdx = props.iqn.indexOf(':')
  if (colonIdx === -1) return props.iqn
  const tail = props.iqn.slice(colonIdx + 1)
  const shown = tail.length > 24 ? '…' + tail.slice(-24) : tail
  return `iqn.…:${shown}`
})
</script>
