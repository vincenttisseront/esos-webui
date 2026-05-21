<template>
  <div class="space-y-4">
    <!-- Identifiant System -->
    <UFormGroup label="Identifiant système (System)" name="system" required>
      <UInput v-model="form.system" placeholder="nas-dellr730xd" />
    </UFormGroup>

    <!-- DBURI -->
    <UFormGroup label="URI de base de données (DBURI)" name="dburi">
      <div class="relative">
        <UInput
          v-model="form.dburi"
          :type="showDbUri ? 'text' : 'password'"
          placeholder="postgres://user:password@host/database"
          class="pr-10"
        />
        <button
          type="button"
          class="absolute inset-y-0 right-0 px-3 text-gray-400 hover:text-gray-600 dark:text-gray-400"
          @click="showDbUri = !showDbUri"
        >
          <UIcon :name="showDbUri ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'" class="w-4 h-4" />
        </button>
      </div>
      <template #hint>
        <span v-if="existingDburiMasked && !form.dburi" class="text-xs text-gray-400">
          Actuel : {{ existingDburiMasked }} — laissez vide pour conserver
        </span>
        <span v-else class="text-xs text-gray-400">
          Format : postgres://user:password@host/db ou mysql://user:password@host/db
        </span>
      </template>
    </UFormGroup>

    <!-- PollingInterval -->
    <UFormGroup label="Intervalle d'échantillonnage (secondes)" name="pollingInterval">
      <UInput
        v-model.number="form.pollingIntervalSec"
        type="number"
        :min="5"
        :max="300"
      />
      <template #hint>
        <span :class="form.pollingIntervalSec !== 5 ? 'text-orange-500' : 'text-gray-400'" class="text-xs">
          Valeur recommandée : 5 s
          <template v-if="form.pollingIntervalSec !== 5"> — une valeur différente est déconseillée par ESOS</template>
        </span>
      </template>
    </UFormGroup>

    <!-- HostAddress (legacy) -->
    <UFormGroup label="HostAddress (héritage, non utilisé)" name="hostAddress">
      <UInput v-model="form.hostAddress" placeholder="" class="opacity-70" />
      <template #hint>
        <span class="text-xs text-gray-400">Champ présent dans le fichier de configuration mais ignoré par l'agent ESOS.</span>
      </template>
    </UFormGroup>
  </div>
</template>

<script setup lang="ts">
import type { PerfAgentConfigUpdate } from '~/server/utils/perf-agent-types'

const props = defineProps<{
  modelValue: PerfAgentConfigUpdate
  existingDburiMasked?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [v: PerfAgentConfigUpdate] }>()

const showDbUri = ref(false)
const form = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
</script>
