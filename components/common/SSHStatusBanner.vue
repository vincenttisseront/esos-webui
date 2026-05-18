<template>
  <Transition name="slide-down">
    <div
      v-if="showBanner"
      class="px-4 py-2.5 flex items-center gap-3 text-sm font-medium"
      :class="bannerClass"
    >
      <span v-if="sshStore.isUnconfigured" class="flex items-center gap-1.5">
        {{ t('banner.ssh.unconfigured_body') }}
        <NuxtLink to="/admin" class="underline font-semibold hover:opacity-80 ml-1">
          {{ t('banner.ssh.unconfigured_cta') }}
        </NuxtLink>
      </span>

      <span v-if="sshStore.isReconnecting" class="flex items-center gap-1.5">
        <span
          class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
        />
        {{ t('banner.ssh.reconnecting') }}
      </span>

      <span v-else-if="sshStore.isError" class="flex items-center gap-1.5">
        <span aria-hidden="true">⚠️</span>
        {{ t('banner.ssh.connection_lost') }}
      </span>

      <span
        v-else-if="sshStore.status === 'connecting'"
        class="flex items-center gap-1.5"
      >
        <span
          class="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"
        />
        {{ t('banner.ssh.connecting') }}
      </span>

      <span v-else class="flex items-center gap-1.5">
        <span aria-hidden="true">⚠️</span>
        {{ pendingReviewLabel }}
      </span>

      <div class="ml-auto flex items-center gap-2">
        <span v-if="errorStore.latest" class="text-xs opacity-75 truncate max-w-md">
          {{ errorStore.latest.message }}
        </span>
        <button
          v-if="errorStore.activeCount > 0"
          class="text-xs underline opacity-75 hover:opacity-100"
          @click="errorStore.dismissAll()"
        >
          {{ t('common.dismiss') }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const sshStore = useSSHStore()
const errorStore = useErrorStore()
const { t } = useEsosI18n()

const pendingReviewLabel = computed(() => {
  const n = errorStore.activeCount
  return n === 1
    ? t('banner.ssh.pending_review_one')
    : t('banner.ssh.pending_review_other', { count: n })
})

const showBanner = computed(
  () => !sshStore.isReady || errorStore.activeCount > 0,
)

const bannerClass = computed(() => {
  if (sshStore.isUnconfigured) return 'bg-blue-50 text-blue-800 border-b border-blue-200'
  if (sshStore.isError) return 'bg-red-600 text-white'
  if (sshStore.isReconnecting) return 'bg-orange-500 text-white'
  if (sshStore.status === 'connecting') return 'bg-yellow-500 text-white'
  if (errorStore.activeCount)
    return 'bg-yellow-100 text-yellow-800 border-b border-yellow-200'
  return ''
})
</script>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
