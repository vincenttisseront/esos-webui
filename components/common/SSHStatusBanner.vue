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

      <span v-else-if="sshStore.isReconnecting" class="flex items-center gap-1.5">
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

      <span v-else-if="errorStore.hasSSHError" class="flex items-center gap-1.5">
        <span aria-hidden="true">⚠️</span>
        {{ errorStore.latest?.message ?? t('banner.ssh.connection_lost') }}
      </span>

      <div class="ml-auto flex items-center gap-2">
        <UButton
          v-if="sshStore.isError || sshStore.isReconnecting"
          size="xs"
          color="neutral"
          variant="soft"
          :loading="reconnecting"
          class="!text-inherit"
          @click="reconnect"
        >
          {{ t('banner.ssh.reconnect') }}
        </UButton>
        <button
          v-if="errorStore.hasSSHError"
          class="text-xs underline opacity-75 hover:opacity-100"
          @click="errorStore.clearSource('ssh')"
        >
          {{ t('common.dismiss') }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { globalSshBannerTone, shouldShowGlobalSshBanner } from '~/utils/error-banner'

const sshStore = useSSHStore()
const errorStore = useErrorStore()
const overviewStore = useOverviewStore()
const { t } = useEsosI18n()
const reconnecting = ref(false)

const showBanner = computed(() =>
  shouldShowGlobalSshBanner(sshStore.status, errorStore.hasSSHError),
)

const bannerClass = computed(() => {
  const tone = globalSshBannerTone(sshStore.status)
  if (tone === 'unconfigured') return 'bg-blue-50 text-blue-800 border-b border-blue-200'
  if (tone === 'error') return 'bg-red-600 text-white'
  if (tone === 'reconnecting') return 'bg-orange-500 text-white'
  if (tone === 'connecting') return 'bg-yellow-500 text-white'
  if (errorStore.hasSSHError) return 'bg-red-600 text-white'
  return ''
})

async function reconnect() {
  reconnecting.value = true
  try {
    await sshStore.fetchStatus()
    if (sshStore.isReady) {
      await overviewStore.fetch()
    }
  } finally {
    reconnecting.value = false
  }
}
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
