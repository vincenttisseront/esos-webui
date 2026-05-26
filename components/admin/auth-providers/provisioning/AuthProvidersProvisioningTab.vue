<script setup lang="ts">
import type { AdminAuthProvidersDto } from '~/server/utils/auth-providers-config'
import type { UserRole } from '~/server/utils/types'
import type { PublicProviderReasonCode } from '~/server/utils/auth-providers-public'
import { simulateLdapRoleMapping } from '~/utils/auth-providers-admin-ui'

export type LdapDirectoryUser = {
  dn:           string
  login:        string
  displayName:  string | null
  mail:         string | null
  groups:       string[]
  esosStatus:   'not_imported' | 'imported' | 'imported_inactive'
  esosUserId?:  string
  esosUsername?: string
  esosRole?:    UserRole
}

export type ProvisionedLdapUser = {
  id:            string
  username:      string
  displayName:   string | null
  role:          UserRole
  active:        boolean
  externalLogin: string | null
  externalEmail: string | null
  dn:            string
  lastLoginAt:   string | null
}

type LdapStatusResponse = {
  ldap: {
    enabled: boolean
    url: string
    baseDn: string
    userFilterTemplate: string
    loginAttr: string
    displayAttr: string
    groupAttr: string
    bindPasswordSet: boolean
  }
  jitEnabled: boolean
  login: { available: boolean; reason?: PublicProviderReasonCode }
  provisionedCounts: { ldapActive: number; ldapTotal: number }
}

const props = defineProps<{
  data: AdminAuthProvidersDto
  readOnly: boolean
  canEdit: boolean
  dirty: boolean
  saving: boolean
  formValid: boolean
  ldapBindPassword: string
}>()

const form = defineModel<{
  jitEnabled: boolean
  jitDefaultRole: UserRole
  jitDefaultActive: boolean
  mappingRulesJson: string
  oidcMaxRole: 'none' | UserRole
  ldapMaxRole: 'none' | UserRole
}>('form', { required: true })

const emit = defineEmits<{
  save: []
  cancel: []
  'go-ldap-tab': []
}>()

const { t, tError } = useEsosI18n()
const { success: toastOk, error: toastErr } = useAppToast()

const status = ref<LdapStatusResponse | null>(null)
const statusPending = ref(false)

const provisioned = ref<ProvisionedLdapUser[]>([])
const provisionedPending = ref(false)

const searchQuery = ref('')
const searchResults = ref<LdapDirectoryUser[]>([])
const searchGroups = ref<string[]>([])
const searching = ref(false)
const selectedDns = ref<Set<string>>(new Set())

const bulkRole = ref<UserRole>('viewer')
const rowRoles = ref<Record<string, UserRole>>({})
const importing = ref(false)

const roleItems = computed(() => [
  { value: 'viewer' as const, label: t('admin.authProviders.roles.viewer') },
  { value: 'operator' as const, label: t('admin.authProviders.roles.operator') },
  { value: 'admin' as const, label: t('admin.authProviders.roles.admin') },
])

function maxRoleValue(v: 'none' | UserRole): UserRole | null {
  return v === 'none' ? null : v
}

function suggestedRole(groups: string[]): UserRole {
  const r = simulateLdapRoleMapping({
    groupDnsText:       groups.join('\n'),
    mappingRulesJson:   form.value.mappingRulesJson,
    defaultRole:        form.value.jitDefaultRole,
    maxRole:            maxRoleValue(form.value.ldapMaxRole),
  })
  return r.ok ? r.result.effectiveRole : form.value.jitDefaultRole
}

function roleForRow(u: LdapDirectoryUser): UserRole {
  return rowRoles.value[u.dn] ?? u.esosRole ?? suggestedRole(u.groups)
}

const selectedUsers = computed(() =>
  searchResults.value.filter((u) => selectedDns.value.has(u.dn)),
)

const previewGroups = computed(() => {
  const g = new Set<string>()
  for (const u of selectedUsers.value) {
    for (const dn of u.groups) g.add(dn)
  }
  return [...g]
})

const advancedOpen = ref(false)

async function loadStatus() {
  statusPending.value = true
  try {
    status.value = await $fetch<LdapStatusResponse>('/api/admin/auth-providers/ldap/status')
  } catch {
    status.value = null
  } finally {
    statusPending.value = false
  }
}

async function loadProvisioned() {
  provisionedPending.value = true
  try {
    const r = await $fetch<{ users: ProvisionedLdapUser[] }>('/api/admin/auth-providers/ldap/provisioned')
    provisioned.value = r.users
  } catch {
    provisioned.value = []
  } finally {
    provisionedPending.value = false
  }
}

async function refreshAll() {
  await Promise.all([loadStatus(), loadProvisioned()])
}

onMounted(() => {
  if (props.canEdit || !props.readOnly) void refreshAll()
})

watch(
  () => props.data?.ldap.url,
  () => { void refreshAll() },
)

async function runSearch() {
  if (!props.canEdit) return
  const q = searchQuery.value.trim()
  if (q.length < 2) {
    toastErr(t('admin.authProviders.provisioning.search.title'), t('admin.authProviders.provisioning.search.queryTooShort'))
    return
  }
  searching.value = true
  selectedDns.value = new Set()
  try {
    const body: { query: string; bindPassword?: string } = { query: q }
    if (props.ldapBindPassword.trim()) body.bindPassword = props.ldapBindPassword.trim()
    const r = await $fetch<{ users: LdapDirectoryUser[]; groups: string[] }>(
      '/api/admin/auth-providers/ldap/search',
      { method: 'POST', body },
    )
    searchResults.value = r.users
    searchGroups.value  = r.groups
    for (const u of r.users) {
      if (!rowRoles.value[u.dn]) rowRoles.value[u.dn] = suggestedRole(u.groups)
    }
  } catch (e: unknown) {
    searchResults.value = []
    toastErr(t('admin.authProviders.provisioning.search.title'), tError(e))
  } finally {
    searching.value = false
  }
}

function toggleSelect(dn: string, on: boolean) {
  const next = new Set(selectedDns.value)
  if (on) next.add(dn)
  else next.delete(dn)
  selectedDns.value = next
}

function toggleSelectAll(on: boolean) {
  if (!on) {
    selectedDns.value = new Set()
    return
  }
  selectedDns.value = new Set(searchResults.value.map((u) => u.dn))
}

function applyBulkRole() {
  for (const dn of selectedDns.value) {
    rowRoles.value[dn] = bulkRole.value
  }
}

function applySuggestedRoles() {
  for (const u of selectedUsers.value) {
    rowRoles.value[u.dn] = suggestedRole(u.groups)
  }
}

async function runImport() {
  if (!props.canEdit || selectedUsers.value.length === 0) return
  importing.value = true
  try {
    const users = selectedUsers.value.map((u) => ({
      dn:           u.dn,
      login:        u.login,
      displayName:  u.displayName,
      mail:         u.mail,
      groups:       u.groups,
      esosUsername: u.esosUsername ?? u.login,
      role:         roleForRow(u),
      active:       true,
    }))
    const body: { users: typeof users; bindPassword?: string } = { users }
    if (props.ldapBindPassword.trim()) body.bindPassword = props.ldapBindPassword.trim()

    const r = await $fetch<{
      imported: number
      updated: number
      failed: Array<{ dn: string; code: string; message: string }>
    }>('/api/admin/auth-providers/ldap/provision', { method: 'POST', body })

    toastOk(
      t('admin.authProviders.provisioning.import.title'),
      t('admin.authProviders.provisioning.import.result', {
        imported: r.imported,
        updated:  r.updated,
        failed:   r.failed.length,
      }),
    )
    if (r.failed.length) {
      toastErr(
        t('admin.authProviders.provisioning.import.title'),
        r.failed.map((f) => f.message).join('; '),
      )
    }
    await refreshAll()
    await runSearch()
  } catch (e: unknown) {
    toastErr(t('admin.authProviders.provisioning.import.title'), tError(e))
  } finally {
    importing.value = false
  }
}

async function patchProvisionedUser(
  user: ProvisionedLdapUser,
  patch: { role?: UserRole; active?: boolean },
) {
  if (!props.canEdit) return
  try {
    await $fetch(`/api/admin/users/${user.id}`, { method: 'PATCH', body: patch })
    await loadProvisioned()
    await loadStatus()
  } catch (e: unknown) {
    toastErr(t('admin.authProviders.provisioning.imported.title'), tError(e))
  }
}

async function removeProvisioned(user: ProvisionedLdapUser) {
  if (!props.canEdit) return
  if (!confirm(t('admin.authProviders.provisioning.imported.confirmDelete', { name: user.username }))) return
  try {
    await $fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    toastOk(t('admin.authProviders.provisioning.imported.title'), t('admin.authProviders.provisioning.imported.deleted'))
    await refreshAll()
  } catch (e: unknown) {
    toastErr(t('admin.authProviders.provisioning.imported.title'), tError(e))
  }
}

function loginReasonLabel(reason?: PublicProviderReasonCode): string {
  if (!reason) return ''
  return t(`admin.authProviders.summary.loginReason.${reason}`)
}

function esosStatusLabel(s: LdapDirectoryUser['esosStatus']): string {
  return t(`admin.authProviders.provisioning.status.esos_${s}`)
}
</script>

<template>
  <div class="space-y-10">
    <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
      {{ t('admin.authProviders.provisioning.intro') }}
    </p>

    <!-- Status -->
    <section class="space-y-4">
      <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {{ t('admin.authProviders.provisioning.steps.connect') }}
      </h2>
      <div
        v-if="statusPending"
        class="text-sm text-gray-500"
      >
        {{ t('common.loading') }}
      </div>
      <div
        v-else-if="status"
        class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3"
      >
        <div class="flex flex-wrap gap-2 items-center">
          <UBadge :color="status.ldap.enabled ? 'green' : 'gray'" variant="subtle">
            {{ status.ldap.enabled ? t('admin.authProviders.summary.enabled') : t('admin.authProviders.summary.disabled') }}
          </UBadge>
          <UBadge :color="status.login.available ? 'green' : 'amber'" variant="subtle">
            {{
              status.login.available
                ? t('admin.authProviders.summary.loginAvailable')
                : t('admin.authProviders.summary.loginHidden', { reason: loginReasonLabel(status.login.reason) })
            }}
          </UBadge>
          <UBadge color="blue" variant="subtle">
            {{ status.jitEnabled ? t('admin.authProviders.summary.jitOn') : t('admin.authProviders.summary.jitOff') }}
          </UBadge>
        </div>
        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
          <div><dt class="inline font-medium text-gray-700 dark:text-gray-300">URL</dt> {{ status.ldap.url || '—' }}</div>
          <div><dt class="inline font-medium text-gray-700 dark:text-gray-300">Base DN</dt> {{ status.ldap.baseDn || '—' }}</div>
          <div class="sm:col-span-2">
            <dt class="font-medium text-gray-700 dark:text-gray-300">{{ t('admin.authProviders.provisioning.status.filter') }}</dt>
            <code class="text-xs break-all">{{ status.ldap.userFilterTemplate || '—' }}</code>
          </div>
        </dl>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          {{
            t('admin.authProviders.provisioning.status.counts', {
              active: status.provisionedCounts.ldapActive,
              total:  status.provisionedCounts.ldapTotal,
            })
          }}
        </p>
        <UButton
          size="sm"
          color="gray"
          variant="soft"
          icon="i-heroicons-cog-6-tooth"
          @click="emit('go-ldap-tab')"
        >
          {{ t('admin.authProviders.provisioning.status.openLdapTab') }}
        </UButton>
      </div>
      <UAlert
        v-else-if="!data.ldap.enabled"
        color="amber"
        :title="t('admin.authProviders.provisioning.empty.ldapDisabled')"
      />
    </section>

    <!-- Search -->
    <section v-if="canEdit && data.ldap.enabled" class="space-y-4">
      <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {{ t('admin.authProviders.provisioning.steps.search') }}
      </h2>
      <div class="flex flex-col sm:flex-row gap-3">
        <UInput
          v-model="searchQuery"
          class="flex-1"
          :placeholder="t('admin.authProviders.provisioning.search.placeholder')"
          @keyup.enter="runSearch"
        />
        <UButton
          :loading="searching"
          icon="i-heroicons-magnifying-glass"
          @click="runSearch"
        >
          {{ t('admin.authProviders.provisioning.search.button') }}
        </UButton>
      </div>
      <p v-if="!searchResults.length && !searching" class="text-sm text-gray-500">
        {{ t('admin.authProviders.provisioning.empty.searchPrompt') }}
      </p>

      <template v-if="searchResults.length">
        <div
          v-if="selectedDns.size"
          class="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
        >
          <span class="text-sm font-medium">
            {{ t('admin.authProviders.provisioning.bulk.selected', { count: selectedDns.size }) }}
          </span>
          <USelect v-model="bulkRole" :items="roleItems" value-key="value" class="w-36" />
          <UButton size="sm" variant="soft" @click="applyBulkRole">
            {{ t('admin.authProviders.provisioning.bulk.applyRole') }}
          </UButton>
          <UButton size="sm" variant="soft" @click="applySuggestedRoles">
            {{ t('admin.authProviders.provisioning.bulk.applySuggested') }}
          </UButton>
          <UButton size="sm" color="primary" :loading="importing" @click="runImport">
            {{ t('admin.authProviders.provisioning.bulk.import') }}
          </UButton>
        </div>

        <div class="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table class="min-w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-800/80 text-left text-xs uppercase text-gray-500">
              <tr>
                <th class="p-3 w-10">
                  <input
                    type="checkbox"
                    :checked="selectedDns.size === searchResults.length && searchResults.length > 0"
                    @change="toggleSelectAll(($event.target as HTMLInputElement).checked)"
                  >
                </th>
                <th class="p-3">{{ t('admin.authProviders.provisioning.table.login') }}</th>
                <th class="p-3">{{ t('admin.authProviders.provisioning.table.displayName') }}</th>
                <th class="p-3">{{ t('admin.authProviders.provisioning.table.mail') }}</th>
                <th class="p-3">{{ t('admin.authProviders.provisioning.table.esosStatus') }}</th>
                <th class="p-3">{{ t('admin.authProviders.provisioning.table.role') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
              <tr v-for="u in searchResults" :key="u.dn">
                <td class="p-3">
                  <input
                    type="checkbox"
                    :checked="selectedDns.has(u.dn)"
                    @change="toggleSelect(u.dn, ($event.target as HTMLInputElement).checked)"
                  >
                </td>
                <td class="p-3 font-mono text-xs">{{ u.login }}</td>
                <td class="p-3">{{ u.displayName || '—' }}</td>
                <td class="p-3">{{ u.mail || '—' }}</td>
                <td class="p-3">
                  <UBadge
                    :color="u.esosStatus === 'imported' ? 'green' : u.esosStatus === 'imported_inactive' ? 'gray' : 'amber'"
                    variant="subtle"
                    size="xs"
                  >
                    {{ esosStatusLabel(u.esosStatus) }}
                  </UBadge>
                </td>
                <td class="p-3">
                  <USelect
                    :model-value="roleForRow(u)"
                    :items="roleItems"
                    value-key="value"
                    class="w-32"
                    :disabled="!selectedDns.has(u.dn)"
                    @update:model-value="(r: UserRole) => { rowRoles[u.dn] = r }"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <details v-if="searchGroups.length" class="text-sm">
          <summary class="cursor-pointer text-primary-600 dark:text-primary-400">
            {{ t('admin.authProviders.provisioning.groups.summary', { count: searchGroups.length }) }}
          </summary>
          <ul class="mt-2 max-h-40 overflow-y-auto font-mono text-xs text-gray-600 dark:text-gray-400 space-y-1">
            <li v-for="g in searchGroups" :key="g">{{ g }}</li>
          </ul>
        </details>
      </template>
      <p v-else-if="searchQuery.trim().length >= 2 && !searching" class="text-sm text-gray-500">
        {{ t('admin.authProviders.provisioning.empty.noResults') }}
      </p>
    </section>

    <UAlert
      v-else-if="readOnly"
      color="blue"
      :title="t('admin.authProviders.readonly.bannerTitle')"
      :description="t('admin.authProviders.provisioning.readOnlyHint')"
    />

    <!-- Imported -->
    <section class="space-y-4">
      <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {{ t('admin.authProviders.provisioning.steps.import') }}
      </h2>
      <div v-if="provisionedPending" class="text-sm text-gray-500">{{ t('common.loading') }}</div>
      <p v-else-if="!provisioned.length" class="text-sm text-gray-500">
        {{ t('admin.authProviders.provisioning.empty.noImported') }}
      </p>
      <div v-else class="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50 dark:bg-gray-800/80 text-left text-xs uppercase text-gray-500">
            <tr>
              <th class="p-3">{{ t('admin.authProviders.provisioning.table.login') }}</th>
              <th class="p-3">{{ t('admin.authProviders.provisioning.table.displayName') }}</th>
              <th class="p-3">{{ t('admin.authProviders.provisioning.table.role') }}</th>
              <th class="p-3">{{ t('admin.authProviders.provisioning.imported.active') }}</th>
              <th class="p-3" />
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-for="u in provisioned" :key="u.id">
              <td class="p-3">
                <span class="font-medium">{{ u.username }}</span>
                <span v-if="u.externalLogin" class="block text-xs text-gray-500 font-mono">{{ u.externalLogin }}</span>
              </td>
              <td class="p-3">{{ u.displayName || '—' }}</td>
              <td class="p-3">
                <USelect
                  :model-value="u.role"
                  :items="roleItems"
                  value-key="value"
                  class="w-32"
                  :disabled="readOnly"
                  @update:model-value="(r: UserRole) => patchProvisionedUser(u, { role: r })"
                />
              </td>
              <td class="p-3">
                <UToggle
                  :model-value="u.active"
                  :disabled="readOnly"
                  @update:model-value="(v: boolean) => patchProvisionedUser(u, { active: v })"
                />
              </td>
              <td class="p-3 text-right">
                <UButton
                  v-if="canEdit"
                  size="xs"
                  color="red"
                  variant="ghost"
                  icon="i-heroicons-trash"
                  @click="removeProvisioned(u)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Advanced -->
    <section>
      <button
        type="button"
        class="flex w-full items-center justify-between text-sm font-semibold text-gray-900 dark:text-gray-100 py-2"
        @click="advancedOpen = !advancedOpen"
      >
        {{ t('admin.authProviders.provisioning.advanced.title') }}
        <span class="text-gray-400">{{ advancedOpen ? '▼' : '▶' }}</span>
      </button>
      <div v-show="advancedOpen" class="pt-4 border-t border-gray-100 dark:border-gray-800">
        <AuthProvidersProvisioningAdvanced
          v-model:form="form"
          :read-only="readOnly"
          :dirty="dirty"
          :saving="saving"
          :form-valid="formValid"
          :preview-groups-from-selection="previewGroups"
          @save="emit('save')"
          @cancel="emit('cancel')"
        />
      </div>
    </section>
  </div>
</template>
