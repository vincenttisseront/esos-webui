<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { evaluatePasswordComplexity } from '~/utils/password-policy'

const auth = useAuthStore()
const router = useRouter()

const newPassword = ref('')
const confirm = ref('')
const error = ref<string | null>(null)
const success = ref(false)
const submitting = ref(false)

const complexity = computed(() => evaluatePasswordComplexity(newPassword.value))
const hasStartedTyping = computed(() => newPassword.value.length > 0)
const complexityError = computed(() => {
  if (!hasStartedTyping.value || complexity.value.isValid) return undefined
  return 'Le mot de passe ne respecte pas la complexite requise'
})
const mismatch = computed(
  () => confirm.value.length > 0 && confirm.value !== newPassword.value,
)
const canSubmit = computed(
  () => complexity.value.isValid && newPassword.value === confirm.value,
)

async function onSubmit() {
  error.value = null
  submitting.value = true
  try {
    await auth.changePassword(newPassword.value)
    success.value = true
    setTimeout(() => router.push('/'), 1000)
  } catch (err: unknown) {
    const e = err as { data?: { message?: string }; message?: string }
    error.value = e.data?.message ?? e.message ?? 'Erreur'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="max-w-xl mx-auto p-6">
    <UCard>
      <template #header>
        <h1 class="text-lg font-bold">Changement de mot de passe</h1>
        <p v-if="auth.mustChangePassword" class="text-sm text-orange-600 mt-1">
          Vous devez définir un nouveau mot de passe avant de continuer.
        </p>
      </template>

      <form class="space-y-4" @submit.prevent="onSubmit">
        <UFormGroup
          label="Nouveau mot de passe"
          required
          :error="complexityError"
        >
          <UInput v-model="newPassword" type="password" autocomplete="new-password" />
        </UFormGroup>

        <UFormGroup
          label="Confirmation"
          required
          :error="mismatch ? 'Les mots de passe ne correspondent pas' : undefined"
        >
          <UInput v-model="confirm" type="password" autocomplete="new-password" />
        </UFormGroup>

        <div v-if="hasStartedTyping" class="grid gap-1.5 text-xs pt-1">
          <div
            v-for="check in complexity.checks"
            :key="check.id"
            class="flex items-center gap-2"
            :class="check.ok ? 'text-green-700' : 'text-gray-400'"
          >
            <UIcon
              :name="check.ok ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
              class="w-4 h-4 shrink-0"
            />
            <span>{{ check.label }}</span>
          </div>
        </div>

        <UAlert v-if="error" color="red" variant="soft" :title="error" />
        <UAlert
          v-if="success"
          color="green"
          variant="soft"
          title="Mot de passe modifié — redirection…"
        />

        <UButton
          type="submit"
          block
          :loading="submitting"
          :disabled="!canSubmit || submitting"
        >
          Valider
        </UButton>
      </form>
    </UCard>
  </div>
</template>
