<script setup lang="ts">
import type { UserPublic } from '../../utils/types'

const { t, tError, locale } = useEsosI18n()

// ─── Données ─────────────────────────────────────────────────────────────────
const { data: users, refresh, pending } = await useFetch<(UserPublic & { isCurrentUser?: boolean; isLastAdmin?: boolean })[]>('/api/admin/users')

// ─── Modales ──────────────────────────────────────────────────────────────────
const showCreate     = ref(false)
const editTarget     = ref<(UserPublic & { isCurrentUser?: boolean; isLastAdmin?: boolean }) | null>(null)
const deleteTarget   = ref<(UserPublic & { isCurrentUser?: boolean; isLastAdmin?: boolean }) | null>(null)
const resetTarget    = ref<(UserPublic & { isCurrentUser?: boolean; isLastAdmin?: boolean }) | null>(null)

// Mot de passe affiché après création / réinitialisation
const revealPassword = ref<string | null>(null)
const revealTitle    = ref('')

// ─── Handlers création ────────────────────────────────────────────────────────
function onCreated(result: { id: string; generatedPassword: string | null }) {
  showCreate.value = false
  if (result.generatedPassword) {
    revealTitle.value    = t('admin.users.reveal.generatedPasswordTitle')
    revealPassword.value = result.generatedPassword
  } else {
    toastSuccess(t('admin.users.toasts.createdWithPassword'), t('admin.users.toasts.createdWithPasswordDesc'))
  }
  refresh()
}

// ─── Handlers modification ────────────────────────────────────────────────────
function onUpdated() {
  editTarget.value = null
  toastSuccess(t('admin.users.toasts.updatedTitle'), t('admin.users.toasts.updatedDesc'))
  refresh()
}

// ─── Handlers activation / désactivation ─────────────────────────────────────
async function toggleActive(user: UserPublic & { isLastAdmin?: boolean }) {
  const newActive = !user.active
  if (!newActive && user.isLastAdmin) return
  try {
    await $fetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      body: { active: newActive },
    })
    toastSuccess(
      newActive ? t('admin.users.toasts.activatedTitle') : t('admin.users.toasts.deactivatedTitle'),
      user.username,
    )
    refresh()
  } catch (err: unknown) {
    toastError(t('admin.users.toasts.errorTitle'), tError(err, t('admin.users.toasts.toggleFailed')))
  }
}

// ─── Handlers suppression ─────────────────────────────────────────────────────
async function confirmDelete() {
  if (!deleteTarget.value) return
  const u = deleteTarget.value
  deleteTarget.value = null
  try {
    await $fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' })
    toastSuccess(t('admin.users.toasts.deletedTitle'), t('admin.users.toasts.deletedDesc', { username: u.username }))
    refresh()
  } catch (err: unknown) {
    toastError(t('admin.users.toasts.errorTitle'), tError(err, t('admin.users.toasts.deleteFailed')))
  }
}

// ─── Handlers réinitialisation mot de passe ───────────────────────────────────
async function confirmReset() {
  if (!resetTarget.value) return
  const u = resetTarget.value
  resetTarget.value = null
  try {
    const data = await $fetch<{ newPassword: string }>(`/api/admin/users/${u.id}/reset-password`, { method: 'POST' })
    revealTitle.value    = t('admin.users.reveal.resetPasswordTitle', { username: u.username })
    revealPassword.value = data.newPassword
    refresh()
  } catch (err: unknown) {
    toastError(t('admin.users.toasts.errorTitle'), tError(err, t('admin.users.toasts.resetFailed')))
  }
}

const showPermissions = ref(false)

// ─── Matrice des permissions ──────────────────────────────────────────────────
const permissionMatrix = [
  { id: 'dashboard_monitoring',       icon: 'i-heroicons-home',                   admin: true,  operator: true,  viewer: true  },
  { id: 'targets_devices_sessions', icon: 'i-heroicons-server-stack',            admin: true,  operator: true,  viewer: true  },
  { id: 'stats_history',            icon: 'i-heroicons-chart-bar',              admin: true,  operator: true,  viewer: true  },
  { id: 'hardware_topology',        icon: 'i-heroicons-cpu-chip',               admin: true,  operator: true,  viewer: true  },
  { id: 'inventory',                icon: 'i-heroicons-clipboard-document-list', admin: true,  operator: true,  viewer: true  },
  { id: 'cluster_ha',               icon: 'i-heroicons-server',                 admin: true,  operator: true,  viewer: true  },
  { id: 'san_list',                 icon: 'i-heroicons-server-stack',            admin: true,  operator: true,  viewer: true  },
  { id: 'san_config_edit',          icon: 'i-heroicons-pencil-square',           admin: true,  operator: true,  viewer: false },
  { id: 'san_add_remove',           icon: 'i-heroicons-plus-circle',             admin: true,  operator: false, viewer: false },
  { id: 'ssh_terminal',             icon: 'i-heroicons-command-line',            admin: true,  operator: true,  viewer: false },
  { id: 'software_dependencies',    icon: 'i-heroicons-cube',                   admin: true,  operator: true,  viewer: false },
  { id: 'user_management',          icon: 'i-heroicons-users',                  admin: true,  operator: false, viewer: false },
]

// ─── Couleur de statut ───────────────────────────────────────────────────────
function statusClass(active: boolean) {
  return active
    ? 'bg-green-100 text-green-700'
    : 'bg-gray-100 text-gray-500'
}

// ─── Format date ──────────────────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const loc = locale.value === 'en' ? 'en-GB' : 'fr-FR'
  return new Date(iso).toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-6 space-y-6">

    <!-- En-tête -->
    <div class="flex items-center justify-between">
      <SectionTitle
        :title="t('admin.users.page.title')"
        :subtitle="t('admin.users.page.subtitle')"
        icon="i-heroicons-users"
      />
      <UButton
        icon="i-heroicons-user-plus"
        :label="t('admin.users.actions.newUser')"
        size="sm"
        @click="showCreate = true"
      />
    </div>

    <!-- Rôles & Permissions -->
    <div class="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <button
        type="button"
        class="w-full px-5 py-3 bg-gray-50 flex items-center gap-2 hover:bg-gray-100 transition-colors text-left"
        :class="showPermissions ? 'border-b border-gray-200' : ''"
        @click="showPermissions = !showPermissions"
      >
        <UIcon name="i-heroicons-shield-check" class="w-4 h-4 text-gray-500" />
        <h2 class="text-sm font-semibold text-gray-700 flex-1">{{ t('admin.users.matrix.toggle') }}</h2>
        <UIcon
          name="i-heroicons-chevron-down"
          class="w-4 h-4 text-gray-400 transition-transform"
          :class="showPermissions ? 'rotate-180' : ''"
        />
      </button>
      <div v-if="showPermissions" class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100">
              <th class="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-56">
                {{ t('admin.users.matrix.permission') }}
              </th>
              <th class="px-4 py-3 text-center">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold">
                  <UIcon name="i-heroicons-shield-check" class="w-3.5 h-3.5" /> {{ t('admin.users.matrix.roles.admin') }}
                </span>
              </th>
              <th class="px-4 py-3 text-center">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                  <UIcon name="i-heroicons-wrench-screwdriver" class="w-3.5 h-3.5" /> {{ t('admin.users.matrix.roles.operator') }}
                </span>
              </th>
              <th class="px-4 py-3 text-center">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
                  <UIcon name="i-heroicons-eye" class="w-3.5 h-3.5" /> {{ t('admin.users.matrix.roles.viewer') }}
                </span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="perm in permissionMatrix" :key="perm.id" class="hover:bg-gray-50/50">
              <td class="px-5 py-2.5 text-gray-700">
                <div class="flex items-center gap-2">
                  <UIcon :name="perm.icon" class="w-4 h-4 text-gray-400 shrink-0" />
                  {{ t(`admin.users.permissions.${perm.id}`) }}
                </div>
              </td>
              <td class="px-4 py-2.5 text-center">
                <UIcon
                  :name="perm.admin ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                  :class="perm.admin ? 'text-green-500' : 'text-gray-200'"
                  class="w-5 h-5 mx-auto"
                />
              </td>
              <td class="px-4 py-2.5 text-center">
                <UIcon
                  :name="perm.operator ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                  :class="perm.operator ? 'text-green-500' : 'text-gray-200'"
                  class="w-5 h-5 mx-auto"
                />
              </td>
              <td class="px-4 py-2.5 text-center">
                <UIcon
                  :name="perm.viewer ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                  :class="perm.viewer ? 'text-green-500' : 'text-gray-200'"
                  class="w-5 h-5 mx-auto"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Tableau utilisateurs -->
    <div class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div v-if="pending" class="flex items-center justify-center py-12 text-gray-400">
        <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin mr-2" />
        {{ t('admin.users.table.loading') }}
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">{{ t('admin.users.table.headers.user') }}</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">{{ t('admin.users.table.headers.role') }}</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">{{ t('admin.users.table.headers.status') }}</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">{{ t('admin.users.table.headers.lastLogin') }}</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">{{ t('admin.users.table.headers.created') }}</th>
            <th class="px-4 py-3 w-10" />
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-if="!users?.length">
            <td colspan="6" class="py-12 text-center text-gray-400">{{ t('admin.users.table.empty') }}</td>
          </tr>
          <tr
            v-for="u in users"
            :key="u.id"
            class="hover:bg-gray-50 transition-colors"
          >
            <!-- Nom -->
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold text-xs shrink-0">
                  {{ u.username.charAt(0).toUpperCase() }}
                </div>
                <div>
                  <div class="font-medium text-gray-900">
                    {{ u.displayName || u.username }}
                    <span v-if="u.isCurrentUser" class="ml-1 text-xs text-gray-400">{{ t('admin.users.table.you') }}</span>
                  </div>
                  <div v-if="u.displayName" class="text-xs text-gray-400">{{ u.username }}</div>
                </div>
              </div>
            </td>

            <!-- Rôle -->
            <td class="px-4 py-3">
              <UserRoleBadge :role="u.role" />
            </td>

            <!-- Statut -->
            <td class="px-4 py-3">
              <div class="flex items-center gap-1.5">
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="statusClass(u.active)"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="u.active ? 'bg-green-500' : 'bg-gray-400'" />
                  {{ u.active ? t('admin.users.table.status.active') : t('admin.users.table.status.inactive') }}
                </span>
                <UTooltip v-if="u.forcePasswordChange" :text="t('admin.users.table.forcePwTooltip')">
                  <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5 text-orange-400" />
                </UTooltip>
              </div>
            </td>

            <!-- Dernière connexion -->
            <td class="px-4 py-3 text-sm text-gray-500">{{ fmtDate(u.lastLoginAt) }}</td>

            <!-- Créé le -->
            <td class="px-4 py-3 text-sm text-gray-500">{{ fmtDate(u.createdAt) }}</td>

            <!-- Actions -->
            <td class="px-4 py-3">
              <div class="flex items-center gap-1 justify-end">
                <UTooltip :text="t('admin.users.tooltips.edit')">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="gray"
                    icon="i-heroicons-pencil-square"
                    :disabled="u.isCurrentUser"
                    @click="editTarget = u"
                  />
                </UTooltip>
                <UTooltip :text="u.active ? t('admin.users.tooltips.deactivate') : t('admin.users.tooltips.activate')">
                  <UButton
                    size="xs"
                    variant="ghost"
                    :color="u.active ? 'gray' : 'green'"
                    :icon="u.active ? 'i-heroicons-no-symbol' : 'i-heroicons-check-circle'"
                    :disabled="u.isCurrentUser || u.isLastAdmin"
                    @click="toggleActive(u)"
                  />
                </UTooltip>
                <UTooltip :text="t('admin.users.tooltips.resetPassword')">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="orange"
                    icon="i-heroicons-key"
                    @click="resetTarget = u"
                  />
                </UTooltip>
                <UTooltip :text="t('admin.users.tooltips.delete')">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="red"
                    icon="i-heroicons-trash"
                    :disabled="u.isCurrentUser || u.isLastAdmin"
                    @click="deleteTarget = u"
                  />
                </UTooltip>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modale : créer -->
    <AppModalHost />
    <Teleport to="body">
      <Transition name="modal-stack">
        <div v-if="showCreate" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <CreateUserModal @cancel="showCreate = false" @created="onCreated" />
        </div>
      </Transition>

      <!-- Modale : modifier -->
      <Transition name="modal-stack">
        <div v-if="editTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <EditUserModal :user="editTarget" @cancel="editTarget = null" @updated="onUpdated" />
        </div>
      </Transition>

      <!-- Modale : confirmer suppression -->
      <Transition name="modal-stack">
        <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <ConfirmModal
            :title="t('admin.users.modals.deleteTitle')"
            :message="t('admin.users.modals.deleteMessage', { username: deleteTarget?.username ?? '' })"
            :confirm-label="t('admin.users.modals.deleteConfirm')"
            intent="danger"
            @confirm="confirmDelete"
            @cancel="deleteTarget = null"
          />
        </div>
      </Transition>

      <!-- Modale : confirmer réinitialisation mot de passe -->
      <Transition name="modal-stack">
        <div v-if="resetTarget" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <ConfirmModal
            :title="t('admin.users.modals.resetTitle')"
            :message="t('admin.users.modals.resetMessage', { username: resetTarget?.username ?? '' })"
            :confirm-label="t('admin.users.modals.resetConfirm')"
            intent="neutral"
            @confirm="confirmReset"
            @cancel="resetTarget = null"
          />
        </div>
      </Transition>

      <!-- Modale : révéler le mot de passe généré -->
      <Transition name="modal-stack">
        <div v-if="revealPassword" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <BaseModal
            :title="revealTitle"
            icon="i-heroicons-key"
            intent="info"
            size="sm"
            :closable="false"
          >
            <div class="space-y-3">
              <p class="text-sm text-gray-600">
                {{ t('admin.users.modals.revealHint') }}
              </p>
              <PasswordReveal :password="revealPassword" />
            </div>
            <template #actions>
              <UButton color="primary" size="sm" :label="t('admin.users.modals.revealCopied')" @click="revealPassword = null" />
            </template>
          </BaseModal>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
.modal-stack-enter-active { transition: all 160ms ease-out; }
.modal-stack-leave-active  { transition: all 120ms ease-in;  }
.modal-stack-enter-from    { opacity: 0; transform: scale(0.97) translateY(8px); }
.modal-stack-leave-to      { opacity: 0; transform: scale(0.97); }
</style>
