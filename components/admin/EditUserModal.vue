<template>
  <BaseModal
    :title="t('admin.users.edit.title')"
    icon="i-heroicons-pencil-square"
    intent="neutral"
    size="sm"
    :closable="!saving"
    @cancel="$emit('cancel')"
  >
    <form class="space-y-4" @submit.prevent="handleSubmit">

      <!-- Nom affiché -->
      <UFormGroup :label="t('admin.users.edit.displayNameLabel')">
        <UInput
          v-model="form.displayName"
          :placeholder="t('admin.users.edit.displayNamePlaceholder')"
          :disabled="saving"
        />
      </UFormGroup>

      <!-- Rôle -->
      <div class="space-y-1.5">
        <p class="text-sm font-medium text-gray-700">
          {{ t('admin.users.edit.roleLabel') }} <span class="text-red-500">*</span>
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="opt in roleOptions"
            :key="opt.value"
            type="button"
            class="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border text-sm transition-colors"
            :class="form.role === opt.value
              ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
              : 'border-gray-200 hover:border-gray-300 text-gray-700'"
            :disabled="saving"
            @click="form.role = opt.value as UserRole"
          >
            <UIcon :name="opt.icon" class="w-4 h-4" />
            <span>{{ opt.label }}</span>
            <UIcon v-if="form.role === opt.value" name="i-heroicons-check" class="w-3.5 h-3.5 ml-0.5" />
          </button>
        </div>
        <p class="text-xs text-gray-400 mt-1">
          {{ t('admin.users.edit.roleHint') }}
        </p>
      </div>

    </form>

    <template #actions>
      <UButton color="gray" variant="outline" size="sm" :label="t('admin.users.edit.cancel')" :disabled="saving" @click="$emit('cancel')" />
      <UButton
        color="primary"
        size="sm"
        :label="t('admin.users.edit.save')"
        :loading="saving"
        icon="i-heroicons-check"
        @click="handleSubmit"
      />
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import type { UserRole, UserPublic } from '../../utils/types'

const props = defineProps<{ user: UserPublic }>()
const emit  = defineEmits<{ cancel: []; updated: [] }>()

const { t, tError } = useEsosI18n()
const { error: toastError } = useAppToast()

const saving = ref(false)
const form = reactive({
  displayName: props.user.displayName ?? '',
  role:        props.user.role as UserRole,
})

const roleOptions = computed(() => [
  { value: 'admin' as const, label: t('admin.users.edit.roles.admin'), icon: 'i-heroicons-shield-check' },
  { value: 'operator' as const, label: t('admin.users.edit.roles.operator'), icon: 'i-heroicons-wrench-screwdriver' },
  { value: 'viewer' as const, label: t('admin.users.edit.roles.viewer'), icon: 'i-heroicons-eye' },
])

async function handleSubmit() {
  saving.value = true
  try {
    await $fetch(`/api/admin/users/${props.user.id}`, {
      method: 'PATCH',
      body: {
        displayName: form.displayName.trim() || null,
        role:        form.role,
      },
    })
    emit('updated')
  } catch (err: unknown) {
    toastError(t('admin.users.toasts.errorTitle'), tError(err))
  } finally {
    saving.value = false
  }
}
</script>
