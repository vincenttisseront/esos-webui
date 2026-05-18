<template>
  <AdminSection title="Connexion SSH" icon="i-heroicons-server">
    <form @submit.prevent="handleSave" class="space-y-4">

      <!-- Host + Port -->
      <div class="grid grid-cols-3 gap-3">
        <UFormGroup label="Hôte" class="col-span-2">
          <UInput v-model="form.host" placeholder="192.168.1.10" :disabled="saving" />
        </UFormGroup>
        <UFormGroup label="Port">
          <UInput v-model.number="form.port" type="number" placeholder="22" :disabled="saving" />
        </UFormGroup>
      </div>

      <!-- Utilisateur -->
      <UFormGroup label="Utilisateur SSH">
        <UInput v-model="form.username" placeholder="root" :disabled="saving" />
      </UFormGroup>

      <!-- Type d'auth -->
      <UFormGroup label="Authentification">
        <div class="flex gap-3">
          <label class="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" v-model="form.authType" value="key" />
            🔑 Clé SSH
          </label>
          <label class="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" v-model="form.authType" value="password" />
            🔒 Mot de passe
          </label>
        </div>
      </UFormGroup>

      <!-- Clé privée -->
      <UFormGroup v-if="form.authType === 'key'" label="Clé privée (base64 ou PEM)">
        <UTextarea
          v-model="form.privateKey"
          placeholder="Coller la clé privée ici ou laisser vide pour conserver l'existante"
          :rows="4"
          class="font-mono text-xs"
          :disabled="saving"
        />
        <template #hint>
          <span class="text-gray-400 text-xs">
            Encodage base64 ou format PEM. Non affiché après enregistrement.
          </span>
        </template>
      </UFormGroup>

      <!-- Mot de passe -->
      <UFormGroup v-else label="Mot de passe SSH">
        <UInput
          v-model="form.password"
          type="password"
          :disabled="saving"
          placeholder="Laisser vide pour conserver l'existant"
        />
      </UFormGroup>

      <!-- Résultat test -->
      <div
        v-if="testResult"
        class="rounded-lg px-3 py-2 text-sm flex items-center gap-2"
        :class="testResult.success
          ? 'bg-green-50 text-green-700 border border-green-200'
          : 'bg-red-50 text-red-700 border border-red-200'"
      >
        <span>{{ testResult.success ? '✓' : '✗' }}</span>
        <span v-if="testResult.success">
          Connexion réussie en {{ testResult.latencyMs }}ms
        </span>
        <span v-else>{{ testResult.error }}</span>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 pt-2">
        <UButton
          type="button"
          color="gray"
          variant="outline"
          :loading="testing"
          icon="i-heroicons-signal"
          label="Tester"
          @click="handleTest"
        />
        <UButton
          type="submit"
          :loading="saving"
          icon="i-heroicons-check"
          label="Enregistrer et reconnecter"
        />
      </div>

    </form>
  </AdminSection>
</template>

<script setup lang="ts">
const admin      = useAdminStore()
const saving     = ref(false)
const testing    = ref(false)
const testResult = computed(() => admin.testResult)
const form       = reactive({ ...admin.sshForm })

async function handleTest() {
  testing.value = true
  try { await admin.testSSH(form as any) }
  finally { testing.value = false }
}

async function handleSave() {
  saving.value = true
  try {
    await admin.saveSSH(form as any)
    useToast().add({ title: 'Configuration SSH enregistrée', color: 'green' })
  } catch (err: any) {
    useToast().add({ title: 'Erreur', description: err?.data?.message, color: 'red' })
  } finally {
    saving.value = false
  }
}
</script>
