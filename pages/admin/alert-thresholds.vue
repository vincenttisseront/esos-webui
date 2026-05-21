<script setup lang="ts">
definePageMeta({ layout: 'default' })

const admin     = useAdminStore()
const authStore = useAuthStore()

const form = reactive<{
  volumeWarnPct: number
  volumeCriticalPct: number
  sessionEnabled: boolean
  sessionPolicy: 'strict' | 'multipath'
  sessionGraceSec: number
  sessionMinActive: number
  fcPortEnabled: boolean
}>({
  volumeWarnPct:     75,
  volumeCriticalPct: 90,
  sessionEnabled:    true,
  sessionPolicy:     'strict',
  sessionGraceSec:   120,
  sessionMinActive:  1,
  fcPortEnabled:     true,
})

const policyOptions = [
  { value: 'strict' as const, label: 'Strict — chaque initiateur du groupe doit avoir une session' },
  { value: 'multipath' as const, label: 'Multipathing — alerte si le nombre d’initiateurs actifs < seuil' },
]

onMounted(async () => {
  await admin.fetchAll()
  if (authStore.user?.role !== 'admin') {
    await navigateTo('/admin', { replace: true })
    return
  }
})

watch(
  () => admin.alertThresholds,
  (v) => {
    if (!v) return
    Object.assign(form, v)
  },
  { immediate: true },
)

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await admin.saveAlertThresholds({ ...form })
    useToast().add({ title: 'Seuils enregistrés', color: 'green' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur'
    useToast().add({ title: msg, color: 'red' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-2xl mx-auto">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">Seuils d’alerte</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Volumes, sessions SCST (strict / multipathing) et ports FC — paramètres globaux WebUI.
        </p>
      </div>
      <UButton to="/admin" color="gray" variant="soft" icon="i-heroicons-arrow-left">
        Retour
      </UButton>
    </header>

    <div v-if="!admin.alertThresholds" class="text-gray-400 text-sm py-8">
      Chargement…
    </div>

    <div v-else class="space-y-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Volumes</h2>
      <UFormGroup label="Seuil avertissement (%)" description="Entre 1 et 99, strictement inférieur au critique.">
        <UInput v-model.number="form.volumeWarnPct" type="number" min="1" max="99" />
      </UFormGroup>
      <UFormGroup label="Seuil critique (%)" description="Entre 1 et 100.">
        <UInput v-model.number="form.volumeCriticalPct" type="number" min="1" max="100" />
      </UFormGroup>

      <hr class="border-gray-100 dark:border-gray-800">

      <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Sessions SCST</h2>
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Alertes session</p>
          <p class="text-xs text-gray-400">Désactive la détection « session perdue / insuffisante » (les targets désactivées restent signalées).</p>
        </div>
        <UToggle v-model="form.sessionEnabled" />
      </div>

      <UFormGroup label="Politique">
        <USelectMenu
          v-model="form.sessionPolicy"
          :options="policyOptions"
          value-attribute="value"
          option-attribute="label"
          class="w-full"
        />
      </UFormGroup>

      <UFormGroup
        label="Fenêtre de grâce (secondes)"
        description="0 = alerte immédiate. Sinon, délai minimal avant d’émettre l’alerte (transitoires ignorés)."
      >
        <UInput v-model.number="form.sessionGraceSec" type="number" min="0" max="3600" />
      </UFormGroup>

      <UFormGroup
        label="Initiateurs actifs minimum (multipathing)"
        description="Nombre minimal d’initiateurs du groupe ayant au moins une session, pour limiter les faux positifs (VMware / chemins standby)."
      >
        <UInput v-model.number="form.sessionMinActive" type="number" min="1" max="4096" />
      </UFormGroup>

      <hr class="border-gray-100 dark:border-gray-800">

      <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Ports FC</h2>
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Alertes port FC hors ligne</p>
          <p class="text-xs text-gray-400">Désactiver limite les faux positifs si l’état FC n’est pas pertinent.</p>
        </div>
        <UToggle v-model="form.fcPortEnabled" />
      </div>

      <div class="flex justify-end pt-2">
        <UButton color="primary" :loading="saving" @click="save">
          Enregistrer
        </UButton>
      </div>
    </div>
  </div>
</template>
