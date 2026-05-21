<template>
  <BaseModal
    :title="t('admin.users.create.title')"
    icon="i-heroicons-user-plus"
    intent="info"
    size="md"
    :closable="!saving"
    @cancel="$emit('cancel')"
  >
    <form class="space-y-4" @submit.prevent="handleSubmit">

      <!-- Nom d'utilisateur + Nom affiché -->
      <div class="grid grid-cols-2 gap-3">
        <UFormGroup :label="t('admin.users.create.usernameLabel')" :error="errors.username">
          <UInput
            v-model="form.username"
            :placeholder="t('admin.users.create.usernamePlaceholder')"
            :disabled="saving"
            autocomplete="off"
          />
        </UFormGroup>
        <UFormGroup :label="t('admin.users.create.displayNameLabel')">
          <UInput
            v-model="form.displayName"
            :placeholder="t('admin.users.create.displayNamePlaceholder')"
            :disabled="saving"
          />
        </UFormGroup>
      </div>

      <!-- Rôle -->
      <div>
        <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{{ t('admin.users.create.roleLabel') }}</p>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="opt in roleOptions"
            :key="opt.value"
            type="button"
            class="flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border transition-colors"
            :class="form.role === opt.value
              ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-sm'
              : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800'"
            :disabled="saving"
            @click="form.role = opt.value as UserRole"
          >
            <UIcon :name="opt.icon" class="w-5 h-5" />
            <span class="font-medium text-xs">{{ opt.label }}</span>
            <span class="text-[10px] text-gray-400 text-center leading-tight">{{ opt.desc }}</span>
          </button>
        </div>
      </div>

      <!-- Mot de passe -->
      <UFormGroup :label="t('admin.users.create.passwordLabel')" :hint="t('admin.users.create.passwordHint')">
        <UInput
          v-model="form.password"
          type="password"
          :placeholder="t('admin.users.create.passwordPlaceholder')"
          :disabled="saving"
          autocomplete="new-password"
        />
        <PasswordStrengthBar v-if="form.password" :password="form.password" class="mt-1.5" />
      </UFormGroup>

      <!-- Forcer changement -->
      <div class="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-4 py-3">
        <div>
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ t('admin.users.create.forcePwTitle') }}</p>
          <p class="text-xs text-gray-400 mt-0.5">{{ t('admin.users.create.forcePwDesc') }}</p>
        </div>
        <UToggle v-model="form.forcePasswordChange" :disabled="saving" />
      </div>

    </form>

    <template #actions>
      <UButton color="gray" variant="outline" size="sm" :label="t('admin.users.create.cancel')" :disabled="saving" @click="$emit('cancel')" />
      <UButton
        color="primary"
        size="sm"
        :label="t('admin.users.create.submit')"
        :loading="saving"
        icon="i-heroicons-user-plus"
        @click="handleSubmit"
      />
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import type { UserRole } from '../../utils/types'

const emit = defineEmits<{
  cancel: []
  created: [{ id: string; generatedPassword: string | null }]
}>()

const { t, tError } = useEsosI18n()
const { error: toastError } = useAppToast()

const saving = ref(false)
const errors = reactive<Record<string, string>>({})

const form = reactive({
  username:            '',
  displayName:         '',
  role:                'operator' as UserRole,
  password:            '',
  forcePasswordChange: true,
})

const roleOptions = computed(() => [
  {
    value: 'admin' as const,
    label: t('admin.users.create.roles.admin.label'),
    icon:  'i-heroicons-shield-check',
    desc:  t('admin.users.create.roles.admin.desc'),
  },
  {
    value: 'operator' as const,
    label: t('admin.users.create.roles.operator.label'),
    icon:  'i-heroicons-wrench-screwdriver',
    desc:  t('admin.users.create.roles.operator.desc'),
  },
  {
    value: 'viewer' as const,
    label: t('admin.users.create.roles.viewer.label'),
    icon:  'i-heroicons-eye',
    desc:  t('admin.users.create.roles.viewer.desc'),
  },
])

function looksLikeUsernameConflict(msg: string) {
  return /utilisé|already|taken|exists|duplicate|unique/i.test(msg)
}

async function handleSubmit() {
  errors.username = ''
  if (!form.username.trim()) {
    errors.username = t('admin.users.validation.usernameRequired')
    return
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(form.username)) {
    errors.username = t('admin.users.validation.usernameChars')
    return
  }

  saving.value = true
  try {
    const data = await $fetch('/api/admin/users', {
      method:  'POST',
      body: {
        username:            form.username.trim(),
        displayName:         form.displayName.trim() || undefined,
        role:                form.role,
        password:            form.password || undefined,
        forcePasswordChange: form.forcePasswordChange,
      },
    })
    emit('created', { id: data.id, generatedPassword: data.generatedPassword })
  } catch (err: unknown) {
    const msg = tError(err)
    if (looksLikeUsernameConflict(msg)) {
      errors.username = msg
    } else {
      toastError(t('admin.users.toasts.errorTitle'), msg)
    }
  } finally {
    saving.value = false
  }
}
</script>
