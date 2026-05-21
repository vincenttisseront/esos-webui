<template>
  <div class="space-y-4">
    <UAlert
      v-if="!isAdmin"
      color="amber"
      variant="soft"
      :title="t('admin.upgrade.package.admin_only')"
    />
    <UAlert
      v-else-if="blocked"
      color="red"
      variant="soft"
      :title="t('admin.upgrade.package.blocked_hint')"
    />

    <template v-else-if="isAdmin">
      <div class="space-y-3 max-w-lg">
        <UFormField :label="t('admin.upgrade.package.choose_file')">
          <input
            ref="fileInput"
            type="file"
            accept=".zip,.tar.gz,.tgz,.tar"
            class="block w-full text-sm text-gray-600 dark:text-gray-300"
            @change="onFileChange"
          >
        </UFormField>
        <UFormField :label="t('admin.upgrade.package.sha256')">
          <UInput v-model="sha256" placeholder="64 caractères hex" />
        </UFormField>
        <UFormField :label="t('admin.upgrade.package.expected_version')">
          <UInput v-model="expectedVersion" placeholder="ex. 3.0.1" />
        </UFormField>
        <UButton
          color="primary"
          :loading="upgradeStore.packageLoading"
          :disabled="!file || !sanId"
          @click="upload"
        >
          {{ t('admin.upgrade.package.upload') }}
        </UButton>
      </div>

      <UAlert
        v-if="upgradeStore.packageError"
        color="red"
        variant="soft"
        class="mt-3"
        :title="upgradeStore.packageError"
      />

      <div
        v-if="upgradeStore.packageStatus && upgradeStore.packageStatus.phase !== 'idle'"
        class="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2 text-sm"
      >
        <p class="font-medium text-gray-800 dark:text-gray-200">
          {{ statusTitle }}
        </p>
        <p v-if="upgradeStore.packageStatus.filename" class="text-gray-600 dark:text-gray-400">
          {{ upgradeStore.packageStatus.filename }}
        </p>
        <p v-if="upgradeStore.packageStatus.installShPath" class="font-mono text-xs text-green-700 dark:text-green-300">
          {{ upgradeStore.packageStatus.installShPath }}
        </p>
        <UProgress
          v-if="progressPercent !== null"
          :value="progressPercent"
          class="mt-2"
        />
        <UButton
          v-if="upgradeStore.packageStatus.phase === 'ready'"
          size="xs"
          color="gray"
          variant="soft"
          @click="remove"
        >
          {{ t('admin.upgrade.package.remove') }}
        </UButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  sanId: string
  blocked: boolean
}>()

const { t } = useEsosI18n()
const authStore = useAuthStore()
const upgradeStore = useUpgradeStore()

const isAdmin = computed(() => authStore.user?.role === 'admin')
const file = ref<File | null>(null)
const sha256 = ref('')
const expectedVersion = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const statusTitle = computed(() => {
  const p = upgradeStore.packageStatus?.phase
  if (p === 'ready') return t('admin.upgrade.package.ready')
  if (p === 'error') return upgradeStore.packageStatus?.error ?? t('admin.upgrade.package.error')
  return t('admin.upgrade.package.uploading')
})

const progressPercent = computed(() => {
  const s = upgradeStore.packageStatus
  if (!s?.bytesTotal || !s.bytesTransferred) return null
  return Math.min(100, Math.round((s.bytesTransferred / s.bytesTotal) * 100))
})

function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
}

async function upload() {
  if (!file.value || !props.sanId) return
  const fd = new FormData()
  fd.append('file', file.value)
  fd.append('sanId', props.sanId)
  if (sha256.value.trim()) fd.append('sha256', sha256.value.trim())
  if (expectedVersion.value.trim()) fd.append('expectedVersion', expectedVersion.value.trim())
  await upgradeStore.uploadPackage(fd)
}

async function remove() {
  if (!props.sanId) return
  await upgradeStore.removePackage(props.sanId)
}

watch(
  () => props.sanId,
  (id) => {
    if (id) void upgradeStore.fetchPackageStatus(id)
  },
  { immediate: true },
)
</script>
