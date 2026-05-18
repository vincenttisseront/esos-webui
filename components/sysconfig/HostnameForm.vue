<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-server" class="text-gray-500 size-5" />
        <span class="font-semibold text-gray-800">Nom d'hôte</span>
      </div>
    </template>

    <div class="space-y-4">
      <UFormField label="Nom d'hôte" :error="errors.hostname">
        <UInput v-model="form.hostname" placeholder="san01" :disabled="isDisabled" />
      </UFormField>

      <UFormField label="Domaine" :error="errors.domain">
        <UInput v-model="form.domain" placeholder="example.com" :disabled="isDisabled" />
      </UFormField>

      <div class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-600">
        FQDN : <span class="font-mono font-semibold text-gray-800">{{ fqdn || '—' }}</span>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <UButton
          label="Enregistrer"
          icon="i-heroicons-check"
          :loading="saving"
          :disabled="!dirty || props.disabled"
          @click="save"
        />
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import type { HostnameConfig } from '~/server/utils/types'
import { useAppToast }         from '~/composables/useAppToast'

const props = defineProps<{
  sanId:    string
  config:   HostnameConfig
  disabled?: boolean
}>()

const emit = defineEmits<{
  saved: [value: HostnameConfig]
}>()

const toast = useAppToast()

const form = reactive({
  hostname: props.config.hostname,
  domain:   props.config.domain,
})

const errors = reactive({ hostname: '', domain: '' })
const saving = ref(false)

const isDisabled = computed(() => props.disabled || saving.value)

const fqdn = computed(() =>
  form.domain ? `${form.hostname}.${form.domain}` : form.hostname
)

const dirty = computed(() =>
  form.hostname !== props.config.hostname ||
  form.domain   !== props.config.domain
)

function validate(): boolean {
  errors.hostname = ''
  errors.domain   = ''
  if (!form.hostname) {
    errors.hostname = 'Le nom d\'hôte est obligatoire'
    return false
  }
  if (!/^[a-zA-Z0-9-]+$/.test(form.hostname)) {
    errors.hostname = 'Lettres, chiffres et tirets uniquement'
    return false
  }
  if (form.domain && !/^[a-zA-Z0-9.-]+$/.test(form.domain)) {
    errors.domain = 'Domaine invalide'
    return false
  }
  return true
}

async function save() {
  if (!validate()) return
  saving.value = true
  try {
    const result = await $fetch<HostnameConfig>(
      `/api/san/${props.sanId}/system-config/hostname`,
      { method: 'PATCH', body: { hostname: form.hostname, domain: form.domain } }
    )
    toast.success('Nom d\'hôte mis à jour', `FQDN : ${result.fqdn}`)
    emit('saved', result)
  } catch (err: any) {
    toast.error('Échec de la mise à jour', err?.data?.message ?? String(err))
  } finally {
    saving.value = false
  }
}
</script>
