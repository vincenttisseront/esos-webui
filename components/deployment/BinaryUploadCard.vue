<template>
  <UCard>
    <template #header>
      <span class="font-semibold">{{ t('admin.deployment.upload.title') }}</span>
    </template>
    <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
      {{ t('admin.deployment.upload.help') }}
    </p>
    <div class="space-y-3">
      <AppFormField :label="t('admin.deployment.upload.file_label') as string">
        <input
          ref="fileInput"
          type="file"
          class="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary-50 file:text-primary-700"
          :disabled="uploading"
          @change="onFileChange"
        >
      </AppFormField>
      <UButton
        icon="i-heroicons-arrow-up-tray"
        color="primary"
        :loading="uploading"
        :disabled="!selectedFile || uploading"
        @click="upload"
      >
        {{ t('admin.deployment.upload.button') }}
      </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const emit = defineEmits<{ uploaded: [] }>()

const { t, tError } = useEsosI18n()
const toast = useAppToast()

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const uploading = ref(false)

function onFileChange() {
  selectedFile.value = fileInput.value?.files?.[0] ?? null
}

async function upload() {
  const f = selectedFile.value
  if (!f) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', f, f.name)
    await $fetch('/api/admin/binaries/upload', { method: 'POST', body: form })
    toast.success(t('admin.deployment.upload.success') as string)
    selectedFile.value = null
    if (fileInput.value) fileInput.value.value = ''
    emit('uploaded')
  } catch (err: unknown) {
    toast.error(t('admin.deployment.upload.error') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    uploading.value = false
  }
}
</script>
