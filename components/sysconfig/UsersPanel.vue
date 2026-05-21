<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-users" class="text-gray-500 dark:text-gray-400 size-5" />
        <span class="font-semibold text-gray-800 dark:text-gray-200">{{ t('admin.sysconfig.users.title') }}</span>
      </div>
    </template>

    <div class="space-y-4">
      <!-- User list -->
      <div class="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div v-if="loading" class="flex items-center justify-center py-8 text-gray-400 gap-2">
          <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin" />
          <span class="text-sm">{{ t('admin.sysconfig.users.loading') }}</span>
        </div>
        <div v-else-if="users.length === 0" class="py-8 text-center text-sm text-gray-400">
          {{ t('admin.sysconfig.users.empty') }}
        </div>
        <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
          <div
            v-for="user in users"
            :key="user.username"
            class="flex items-center justify-between px-4 py-3"
          >
            <div class="flex items-center gap-3 min-w-0">
              <UIcon name="i-heroicons-user-circle" class="size-5 text-gray-400 shrink-0" />
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-mono font-medium text-gray-800 dark:text-gray-100">{{ user.username }}</span>
                  <UBadge :label="`uid:${user.uid}`" color="neutral" variant="subtle" size="xs" />
                </div>
                <div class="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                  <span class="font-mono">{{ user.shell }}</span>
                  <span>{{ user.home }}</span>
                  <span v-if="user.hasHomeDir" class="text-blue-500 flex items-center gap-1">
                    <UIcon name="i-heroicons-home" class="size-3" />
                    /home/{{ user.username }}
                  </span>
                  <span v-if="user.lastPasswordChange" class="flex items-center gap-1">
                    <UIcon name="i-heroicons-key" class="size-3" />
                    {{ user.lastPasswordChange }}
                  </span>
                  <span v-else class="italic">{{ t('admin.sysconfig.users.key_unknown') }}</span>
                </div>
              </div>
            </div>
            <UButton
              icon="i-heroicons-trash"
              color="red"
              variant="ghost"
              size="xs"
              :disabled="props.disabled || deleting === user.username"
              :loading="deleting === user.username"
              @click="onDelete(user.username)"
            />
          </div>
        </div>
      </div>

      <!-- Add user form -->
      <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">{{ t('admin.sysconfig.users.add_section') }}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <UFormField :label="t('admin.sysconfig.users.username') as string" :error="usernameError">
            <UInput
              v-model="form.username"
              placeholder="nomutilisateur"
              class="w-full font-mono"
              :disabled="saving || props.disabled"
            />
          </UFormField>
          <UFormField :label="t('admin.sysconfig.users.password') as string" :error="complexityError">
            <UInput
              v-model="form.password"
              type="password"
              placeholder="••••••••"
              class="w-full"
              :disabled="saving || props.disabled"
            />
            <!-- Jauge + règles de complexité -->
            <div v-if="form.password.length > 0" class="mt-2 space-y-2">
              <div class="flex gap-1">
                <div
                  v-for="i in 4"
                  :key="i"
                  class="h-1 flex-1 rounded-full transition-colors"
                  :class="complexityColor(i)"
                />
              </div>
              <p class="text-xs" :class="complexity.isValid ? 'text-green-600' : 'text-gray-400'">
                {{ complexityLabel }}
              </p>
              <div class="grid gap-1 text-xs">
                <div
                  v-for="check in localizedChecks"
                  :key="check.id"
                  class="flex items-center gap-1.5"
                  :class="check.ok ? 'text-green-700' : 'text-gray-400'"
                >
                  <UIcon
                    :name="check.ok ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    class="w-3.5 h-3.5 shrink-0"
                  />
                  <span>{{ check.label }}</span>
                </div>
              </div>
            </div>
          </UFormField>
          <UFormField :label="t('admin.sysconfig.users.confirm_password') as string" :error="confirmError">
            <UInput
              v-model="form.passwordConfirm"
              type="password"
              placeholder="••••••••"
              class="w-full"
              :disabled="saving || props.disabled"
              @keydown.enter="onAdd"
            />
          </UFormField>
        </div>
        <div class="flex justify-end">
          <UButton
            :label="t('admin.sysconfig.users.create') as string"
            icon="i-heroicons-plus"
            :loading="saving"
            :disabled="!canAdd || props.disabled"
            @click="onAdd"
          />
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { modalDestructive }          from '~/composables/useModal'
import { useAppToast }               from '~/composables/useAppToast'
import { evaluatePasswordComplexity } from '~/utils/password-policy'

interface EsosUser {
  username:           string
  uid:                number
  shell:              string
  home:               string
  hasHomeDir:         boolean
  lastPasswordChange: string | null
}

const props = defineProps<{
  sanId:     string
  disabled?: boolean
}>()

const { t, tError } = useEsosI18n()
const toast    = useAppToast()
const loading  = ref(false)
const saving   = ref(false)
const deleting = ref<string | null>(null)
const users    = ref<EsosUser[]>([])

const form = reactive({
  username:        '',
  password:        '',
  passwordConfirm: '',
})

const complexity = computed(() => evaluatePasswordComplexity(form.password))

const localizedChecks = computed(() =>
  complexity.value.checks.map(check => ({
    ...check,
    label: t(`admin.sysconfig.users.policy_checks.${check.id}`),
  })),
)

const complexityLabel = computed(() => {
  const score = complexity.value.score ?? 0
  if (score <= 1) return t('admin.sysconfig.users.strength_very_weak')
  if (score === 2) return t('admin.sysconfig.users.strength_weak')
  if (score === 3) return t('admin.sysconfig.users.strength_fair')
  return complexity.value.isValid
    ? t('admin.sysconfig.users.strength_ok')
    : t('admin.sysconfig.users.strength_fair')
})

function complexityColor(step: number): string {
  const score = complexity.value.score ?? 0
  if (score < step) return 'bg-gray-200'
  if (score <= 1) return 'bg-red-400'
  if (score === 2) return 'bg-orange-400'
  if (score === 3) return 'bg-yellow-400'
  return 'bg-green-500'
}

const complexityError = computed(() => {
  if (!form.password || complexity.value.isValid) return undefined
  return t('admin.sysconfig.users.policy_error') as string
})

const canAdd = computed(() =>
  form.username.trim().length > 0 &&
  !usernameError.value &&
  complexity.value.isValid &&
  form.password === form.passwordConfirm,
)

const usernameError = computed(() => {
  if (!form.username) return undefined
  if (!/^[a-z][a-z0-9_-]*$/.test(form.username)) return t('admin.sysconfig.users.err_username_chars') as string
  return undefined
})

const confirmError = computed(() => {
  if (!form.passwordConfirm) return undefined
  if (form.password !== form.passwordConfirm) return t('admin.sysconfig.users.err_password_mismatch') as string
  return undefined
})

async function fetchUsers() {
  loading.value = true
  try {
    const data = await $fetch<{ users: EsosUser[] }>(`/api/san/${props.sanId}/system-config/users`)
    users.value = data.users
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    loading.value = false
  }
}

async function onAdd() {
  if (!canAdd.value) return
  saving.value = true
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/users`, {
      method: 'POST',
      body:   { username: form.username.trim(), password: form.password },
    })
    toast.success(t('admin.sysconfig.users.toast_created', { username: form.username }) as string)
    form.username = ''
    form.password = ''
    form.passwordConfirm = ''
    await fetchUsers()
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    saving.value = false
  }
}

async function onDelete(username: string) {
  const ok = await modalDestructive({
    title:        t('admin.sysconfig.users.delete_title', { username }) as string,
    message:      t('admin.sysconfig.users.confirm_delete_msg') as string,
    confirmLabel: t('admin.sysconfig.users.delete_confirm_label') as string,
    inputConfirm: username,
  })
  if (!ok) return

  deleting.value = username
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/users/${username}`, {
      method: 'DELETE',
    })
    toast.success(t('admin.sysconfig.users.toast_deleted', { username }) as string)
    await fetchUsers()
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    deleting.value = null
  }
}

onMounted(fetchUsers)
</script>
