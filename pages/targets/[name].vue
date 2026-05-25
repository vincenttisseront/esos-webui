<template>
  <div class="space-y-6">
    <StorageReadOnlyBanner :read-only="isEffectiveReadOnly" />

    <!-- Breadcrumb + actions -->
    <div class="flex items-center gap-3 flex-wrap justify-between">
      <div class="flex items-center gap-3 flex-wrap">
        <NuxtLink to="/targets" class="text-primary-500 hover:underline text-sm">
          {{ t('storage.targets.detail.breadcrumbBack') }}
        </NuxtLink>
        <span class="text-gray-400">/</span>
        <IqnDisplay :iqn="name" full />
        <TargetBadge v-if="target" :enabled="target.enabled" />
      </div>

      <div v-if="target" class="flex items-center gap-2">
        <template v-if="!isEffectiveReadOnly">
        <UButton
          v-if="target.enabled"
          icon="i-heroicons-pause-circle"
          :label="t('storage.targets.actions.disable')"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="toggling"
          @click="toggleEnabled(false)"
        />
        <UButton
          v-else
          icon="i-heroicons-play-circle"
          :label="t('storage.targets.actions.enable')"
          color="primary"
          variant="outline"
          size="sm"
          :loading="toggling"
          @click="toggleEnabled(true)"
        />
        <UButton
          icon="i-heroicons-trash"
          :label="t('storage.targets.actions.delete')"
          color="error"
          variant="soft"
          size="sm"
          :loading="deleting"
          @click="confirmDelete"
        />
        </template>
        <UBadge v-else color="neutral" variant="subtle" icon="i-heroicons-lock-closed" :label="t('storage.targets.detail.readOnlyBadge')" />
      </div>
    </div>

    <div v-if="pending && !target" class="text-gray-500 dark:text-gray-400 text-sm">
      {{ t('storage.targets.detail.loading') }}
    </div>

    <template v-else-if="target">
      <section>
        <SectionTitle
          :title="t('storage.targets.detail.sections.activeSessions')"
          :count="target.sessions.length"
          live
        />
        <SessionTable
          v-if="target.sessions.length > 0"
          :sessions="target.sessions"
          hide-target
        />
        <p v-else class="text-sm text-gray-400 italic">
          {{ t('storage.targets.detail.empty.noSessionsOnTarget') }}
        </p>
      </section>

      <div
        v-if="isClusterMode"
        class="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30 px-4 py-3 text-sm"
      >
        <p class="font-semibold text-blue-900 dark:text-blue-100">
          {{ t('storage.hosts.clusterBanner.title') }}
        </p>
        <p class="text-blue-800 dark:text-blue-200 mt-1">
          {{ t('storage.hosts.clusterBanner.body') }}
        </p>
        <NuxtLink
          to="/cluster"
          class="text-primary-600 hover:underline text-xs mt-2 inline-block"
        >
          {{ t('storage.hosts.clusterBanner.adminLink') }} →
        </NuxtLink>
      </div>

      <ScstClusterNodeResults
        v-if="lastNodeResults?.length"
        :node-results="lastNodeResults"
      />

      <details class="rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3">
        <summary class="cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-200">
          {{ t('storage.hosts.help.title') }}
        </summary>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-2">
          {{ t('storage.hosts.help.summary') }}
        </p>
        <p class="text-sm text-gray-500 dark:text-gray-500 mt-2">
          {{ t('storage.hosts.help.synonyms') }}
        </p>
        <a
          href="https://github.com/quantum/esos/wiki/35_Hosts_and_Initiators"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary-500 hover:underline text-xs mt-2 inline-block"
        >
          {{ t('storage.hosts.help.wikiLink') }} ↗
        </a>
      </details>

      <section v-if="target.luns.length > 0">
        <SectionTitle
          :title="t('storage.hosts.sections.targetLuns')"
          :count="target.luns.length"
        />
        <table class="w-full text-sm bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <thead class="bg-gray-50 dark:bg-gray-800/50">
            <tr class="text-xs text-gray-400 uppercase">
              <th class="text-left px-4 py-2">{{ t('storage.targets.groupPanel.lunTableHeaders.id') }}</th>
              <th class="text-left px-4 py-2">{{ t('storage.targets.groupPanel.lunTableHeaders.device') }}</th>
              <th class="text-left px-4 py-2">{{ t('storage.targets.groupPanel.lunTableHeaders.handler') }}</th>
              <th class="text-left px-4 py-2">{{ t('storage.targets.groupPanel.lunTableHeaders.path') }}</th>
              <th class="text-left px-4 py-2">{{ t('storage.targets.groupPanel.lunTableHeaders.ro') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
            <tr v-for="lun in target.luns" :key="lun.id">
              <td class="px-4 py-2 font-mono text-gray-500">{{ lun.id }}</td>
              <td class="px-4 py-2 font-semibold">{{ lun.device }}</td>
              <td class="px-4 py-2 text-gray-500">{{ devicesMap.get(lun.device)?.handler ?? '—' }}</td>
              <td class="px-4 py-2 font-mono text-xs text-gray-500">{{ devicesMap.get(lun.device)?.filename ?? '—' }}</td>
              <td class="px-4 py-2">
                <UBadge
                  v-if="lun.readOnly"
                  color="orange"
                  variant="soft"
                  size="xs"
                  :label="t('storage.targets.groupPanel.readOnlyBadge')"
                />
                <span v-else class="text-gray-300">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <div class="flex items-center justify-between gap-3 flex-wrap mb-1">
          <SectionTitle :title="t('storage.targets.detail.sections.accessGroups')" :count="target.groups.length" />
          <UButton
            v-if="!isEffectiveReadOnly"
            icon="i-heroicons-plus"
            size="sm"
            :label="t('storage.hosts.actions.addGroup')"
            :loading="hostsLoading"
            @click="openAddGroup"
          />
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
          {{ t('storage.hosts.sections.accessGroupsHint') }}
        </p>
        <div
          v-if="exposeDevice && !isEffectiveReadOnly"
          class="rounded-lg border border-green-200 dark:border-green-900 bg-green-50/60 dark:bg-green-950/30 px-4 py-3 text-sm"
        >
          <p class="font-semibold text-green-900 dark:text-green-100">
            {{ t('storage.hosts.exposeCta.title') }}
          </p>
          <p class="text-green-800 dark:text-green-200 mt-1">
            {{ t('storage.hosts.exposeCta.body') }}
          </p>
          <p class="font-mono text-xs mt-2">{{ exposeDevice }}</p>
          <UButton
            v-if="target.groups.length === 0"
            class="mt-2"
            size="sm"
            :label="t('storage.hosts.actions.addGroup')"
            @click="openAddGroup"
          />
        </div>

        <div v-if="target.groups.length > 0" class="space-y-3">
          <GroupPanel
            v-for="group in target.groups"
            :key="group.name"
            :group="group"
            :devices-map="devicesMap"
            :read-only="isEffectiveReadOnly"
            @add-initiator="openAddInitiator"
            @remove-initiator="onRemoveInitiator"
            @remove-group="onRemoveGroup"
            @map-lun="openMapLun"
            @unmap-lun="onUnmapLun"
          />
        </div>
        <EmptyState v-else :message="t('storage.targets.detail.empty.noGroups')" icon="👥" />
      </section>

      <section>
        <SectionTitle
          :title="t('storage.hosts.unmapped.title')"
          :count="unmappedDevices.length || undefined"
        />
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">{{ t('storage.hosts.unmapped.hint') }}</p>
        <ul v-if="unmappedDevices.length > 0" class="space-y-2 text-sm">
          <li
            v-for="dev in unmappedDevices"
            :key="dev.name"
            class="flex items-center justify-between gap-2 flex-wrap"
          >
            <span class="font-mono font-semibold">{{ dev.name }}</span>
            <span class="text-gray-500 dark:text-gray-400 text-xs">{{ dev.handler }} — {{ dev.filename }}</span>
            <div v-if="!isEffectiveReadOnly && target.groups.length > 0" class="flex flex-wrap gap-1">
              <UButton
                v-for="g in target.groups"
                :key="g.name"
                size="xs"
                variant="soft"
                :label="`${t('storage.hosts.unmapped.mapToGroup')}: ${g.name}`"
                :loading="hostsLoading"
                @click="openMapLun(g.name, dev.name)"
              />
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-gray-400 italic">
          {{ t('storage.hosts.unmapped.empty') }}
        </p>
      </section>

      <section v-if="!isEffectiveReadOnly && discoveredInitiators.length > 0">
        <SectionTitle
          :title="t('storage.hosts.discovered.title')"
          :count="discoveredInitiators.length"
        />
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">{{ t('storage.hosts.discovered.hint') }}</p>
        <ul class="space-y-2">
          <li
            v-for="init in discoveredInitiators"
            :key="init"
            class="flex items-center justify-between gap-2 text-sm"
          >
            <IqnDisplay :iqn="init" />
            <div v-if="target.groups.length > 0" class="flex flex-wrap gap-1">
              <UButton
                v-for="g in target.groups"
                :key="g.name"
                size="xs"
                variant="soft"
                :label="`${t('storage.hosts.actions.addDiscovered')}: ${g.name}`"
                :loading="hostsLoading"
                @click="addDiscoveredToGroup(g.name, init)"
              />
            </div>
          </li>
        </ul>
      </section>
    </template>

    <EmptyState v-else :message="t('storage.targets.detail.empty.notFound')" icon="❓" />
  </div>
</template>

<script setup lang="ts">
import DestructiveModal from '~/components/modals/DestructiveModal.vue'
import AddGroupModal from '~/components/targets/AddGroupModal.vue'
import AddInitiatorModal from '~/components/targets/AddInitiatorModal.vue'
import MapLunModal from '~/components/targets/MapLunModal.vue'
import { discoveredInitiatorsForTarget } from '~/utils/scst-discovered-initiators'
import { unmappedDevicesFromOverview } from '~/utils/scst-unmapped-devices'
import { expectedDeleteGroupConfirmation } from '~/utils/scst-initiator-validation'
import { expectedUnmapLunConfirmation } from '~/utils/scst-lun-validation'

const { t } = useEsosI18n()
const route = useRoute()
const router = useRouter()
const name = computed(() => decodeURIComponent(route.params.name as string))

const { target, loading: pending, refresh } = useTargetDetail(name)
const { overview, refresh: refreshOverview } = useOverview()
const { isEffectiveReadOnly } = useSelectedSan()
const modal = useAppModal()
const toast = useAppToast()

const exposeDevice = computed(() => {
  const q = route.query.exposeDevice
  return typeof q === 'string' ? q : undefined
})

const {
  loading: hostsLoading,
  isClusterMode,
  lastNodeResults,
  createGroup,
  deleteGroup,
  addInitiator,
  removeInitiator,
  preflightCreateGroup,
  preflightAddInitiator,
  preflightRemoveInitiator,
  preflightMapLun,
  mapLun,
  unmapLun,
} = useTargetHosts(name, { refresh, refreshOverview })

const discoveredInitiators = computed(() =>
  target.value ? discoveredInitiatorsForTarget(target.value) : [],
)

const devicesMap = computed(() => {
  const map = new Map<string, { handler: string; filename: string }>()
  for (const d of overview.value?.devices ?? []) {
    map.set(d.name, { handler: d.handler, filename: d.filename })
  }
  return map
})

const unmappedDevices = computed(() =>
  overview.value ? unmappedDevicesFromOverview(overview.value) : [],
)

async function openAddGroup() {
  try {
    const payload = await modal.open<{ targetName: string; groupName: string }>({
      component: AddGroupModal,
      props: {
        targetName: name.value,
        loading: hostsLoading.value,
        runPreflight: (_target, group) => preflightCreateGroup(group),
      },
    })
    await createGroup(payload.groupName)
    toast.success(t('storage.hosts.toasts.groupCreated') as string, payload.groupName)
  } catch (err: unknown) {
    if (isDismiss(err)) return
    toastHostsError(err)
  }
}

async function openAddInitiator(groupName: string, initialValue?: string) {
  try {
    const payload = await modal.open<{
      targetName: string
      groupName: string
      initiator: string
      type: import('~/utils/scst-initiator-validation').InitiatorType
    }>({
      component: AddInitiatorModal,
      props: {
        groupName,
        targetName: name.value,
        initialValue,
        loading: hostsLoading.value,
        runPreflight: (_target, group, initiator, type) =>
          preflightAddInitiator(group, initiator, type),
      },
    })
    await addInitiator(payload.groupName, payload.initiator, payload.type)
    toast.success(t('storage.hosts.toasts.initiatorAdded') as string, payload.initiator)
  } catch (err: unknown) {
    if (isDismiss(err)) return
    toastHostsError(err)
  }
}

async function addDiscoveredToGroup(groupName: string, initiator: string) {
  if (!groupName) return
  try {
    await addInitiator(groupName, initiator, 'auto')
    toast.success(t('storage.hosts.toasts.initiatorAdded') as string, initiator)
  } catch (err: unknown) {
    toastHostsError(err)
  }
}

async function onRemoveInitiator(payload: { groupName: string; initiator: string }) {
  let preflightWarnings: string[] = []
  try {
    const pre = await preflightRemoveInitiator(payload.groupName, payload.initiator)
    preflightWarnings = pre.warnings
  } catch {
    /* preflight optional if SSH down */
  }

  const ioWarning = t('storage.hosts.modals.removeInitiator.ioWarning') as string
  const warningBlock = [...preflightWarnings, ioWarning].filter(Boolean).join('\n\n')
  const message = warningBlock
    ? `${warningBlock}\n\n${payload.initiator}`
    : payload.initiator

  try {
    await modal.open({
      component: DestructiveModal,
      props: {
        title: t('storage.hosts.modals.removeInitiator.title') as string,
        message,
        confirmLabel: t('storage.hosts.modals.removeInitiator.confirmLabel') as string,
        inputConfirm: payload.initiator.split(':').pop() ?? payload.initiator.slice(-8),
      },
    })
  } catch {
    return
  }
  try {
    await removeInitiator(payload.groupName, payload.initiator)
    toast.success(t('storage.hosts.toasts.initiatorRemoved') as string, payload.initiator)
  } catch (err: unknown) {
    toastHostsError(err)
  }
}

async function openMapLun(groupName: string, initialDeviceName?: string) {
  if (!target.value || !overview.value) return
  try {
    const payload = await modal.open<{
      targetName: string
      groupName: string
      lunId: number
      deviceName: string
      readOnly: boolean
    }>({
      component: MapLunModal,
      props: {
        targetName: name.value,
        groupName,
        target: target.value,
        overview: overview.value,
        unmappedDevices: unmappedDevices.value,
        initialDeviceName: initialDeviceName ?? exposeDevice.value,
        loading: hostsLoading.value,
        runPreflight: (_target, group, lunId, deviceName, readOnly) =>
          preflightMapLun(group, lunId, deviceName, readOnly),
      },
    })
    await mapLun(payload.groupName, payload.lunId, payload.deviceName, payload.readOnly)
    toast.success(
      t('storage.hosts.luns.toasts.mapped') as string,
      `${payload.deviceName} → LUN ${payload.lunId}`,
    )
    if (exposeDevice.value) {
      await router.replace({ query: { ...route.query, exposeDevice: undefined } })
    }
  } catch (err: unknown) {
    if (isDismiss(err)) return
    toastHostsError(err)
  }
}

async function onUnmapLun(payload: { groupName: string; lunId: number; device: string }) {
  const expected = expectedUnmapLunConfirmation(name.value, payload.groupName, payload.lunId)
  try {
    await modal.open({
      component: DestructiveModal,
      props: {
        title: t('storage.hosts.luns.modals.unmap.title', { id: payload.lunId }) as string,
        message: t('storage.hosts.luns.modals.unmap.message', {
          id: payload.lunId,
          device: payload.device,
          group: payload.groupName,
        }) as string,
        confirmLabel: t('storage.hosts.luns.modals.unmap.confirmLabel') as string,
        inputConfirm: expected,
      },
    })
  } catch {
    return
  }
  try {
    await unmapLun(payload.groupName, payload.lunId)
    toast.success(t('storage.hosts.luns.toasts.unmapped') as string, `LUN ${payload.lunId}`)
  } catch (err: unknown) {
    toastHostsError(err)
  }
}

async function onRemoveGroup(groupName: string) {
  const group = target.value?.groups.find(g => g.name === groupName)
  const hasInitiators = (group?.initiators.length ?? 0) > 0
  const hasLuns = (group?.luns.length ?? 0) > 0
  const needsForce = hasInitiators || hasLuns
  const expected = expectedDeleteGroupConfirmation(name.value, groupName)

  let message: string
  if (hasInitiators && hasLuns) {
    message = t('storage.hosts.modals.removeGroup.messageWithInitiatorsAndLuns', {
      initiators: group!.initiators.length,
      count: group!.luns.length,
    }) as string
  } else if (hasInitiators) {
    message = t('storage.hosts.modals.removeGroup.messageWithInitiators', {
      count: group!.initiators.length,
    }) as string
  } else if (hasLuns) {
    message = t('storage.hosts.modals.removeGroup.messageWithLuns', { count: group!.luns.length }) as string
  } else {
    message = t('storage.hosts.modals.removeGroup.message') as string
  }

  try {
    await modal.open({
      component: DestructiveModal,
      props: {
        title: t('storage.hosts.modals.removeGroup.title', { name: groupName }) as string,
        message,
        confirmLabel: t('storage.hosts.modals.removeGroup.confirmLabel') as string,
        inputConfirm: needsForce ? expected : undefined,
      },
    })
  } catch {
    return
  }

  try {
    await deleteGroup(groupName, needsForce ? { force: true, confirmation: expected } : undefined)
    toast.success(t('storage.hosts.toasts.groupRemoved') as string, groupName)
  } catch (err: unknown) {
    toastHostsError(err)
  }
}

function isDismiss(err: unknown): boolean {
  return err === false || err === null || err === undefined
}

function toastHostsError(err: unknown) {
  const e = err as { statusMessage?: string; message?: string; data?: { nodeResults?: unknown[] } }
  const msg = e.statusMessage ?? e.message ?? (t('storage.targets.toasts.errorGeneric') as string)
  if (e.data?.nodeResults) {
    toast.error(t('storage.hosts.toasts.partialCluster') as string, msg)
    return
  }
  toast.error(t('storage.hosts.toasts.errorTitle') as string, msg)
}

// ─── Activer / Désactiver ────────────────────────────────────────────────────
const toggling = ref(false)

async function toggleEnabled(enabled: boolean) {
  toggling.value = true
  try {
    await $fetch(`/api/targets/${encodeURIComponent(name.value)}`, {
      method: 'PATCH',
      body: { enabled },
    })
    toast.success(
      enabled ? t('storage.targets.toasts.enabledTitle') : t('storage.targets.toasts.disabledTitle'),
      name.value,
    )
    await refresh()
    await refreshOverview()
  } catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    toast.error(t('storage.targets.toasts.errorTitle') as string, e.statusMessage ?? e.message ?? (t('storage.targets.toasts.errorGeneric') as string))
  } finally {
    toggling.value = false
  }
}

// ─── Suppression ─────────────────────────────────────────────────────────────
const deleting = ref(false)

async function confirmDelete() {
  const hasActiveSessions = (target.value?.sessions ?? []).length > 0

  try {
    await modal.open({
      component: DestructiveModal,
      props: {
        title: t('storage.targets.deleteModal.title', { name: name.value }) as string,
        message: hasActiveSessions
          ? (t('storage.targets.deleteModal.messageWithSessions', { count: target.value!.sessions.length }) as string)
          : (t('storage.targets.deleteModal.messageNoSessions') as string),
        confirmLabel: t('storage.targets.deleteModal.confirmLabel') as string,
        inputConfirm: name.value.split(':').pop() ?? name.value,
      },
    })
  } catch {
    return
  }

  deleting.value = true
  try {
    await $fetch(`/api/targets/${encodeURIComponent(name.value)}`, {
      method: 'DELETE',
    })
    toast.success(t('storage.targets.toasts.deletedTitle') as string, name.value)
    await refreshOverview()
    router.push('/targets')
  } catch (err: unknown) {
    const e = err as { statusMessage?: string; message?: string }
    toast.error(t('storage.targets.toasts.deleteErrorTitle') as string, e.statusMessage ?? e.message ?? (t('storage.targets.toasts.errorGeneric') as string))
  } finally {
    deleting.value = false
  }
}
</script>
