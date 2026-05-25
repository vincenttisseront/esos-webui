<template>
  <div class="space-y-4">
    <StorageReadOnlyBanner :read-only="isEffectiveReadOnly" compact />

    <details class="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
      <summary class="text-sm font-medium cursor-pointer select-none">
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

    <div class="flex items-center justify-between gap-3 flex-wrap">
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('storage.targets.list.countLine', { count: filtered.length }) }}</p>
      <div class="flex flex-wrap gap-2 items-center">
        <UInput
          v-model="search"
          :placeholder="t('storage.targets.list.searchPlaceholder')"
          icon="i-heroicons-magnifying-glass"
          class="w-64"
        />
        <template v-if="!isEffectiveReadOnly">
          <UButton
            size="sm"
            icon="i-heroicons-plus"
            :label="t('storage.hosts.actions.addGroup')"
            :disabled="!allTargets.length"
            :loading="hostsLoading"
            @click="openCreateGroup"
          />
          <UButton
            size="sm"
            color="primary"
            variant="soft"
            icon="i-heroicons-user-plus"
            :label="t('storage.hosts.actions.addInitiator')"
            :disabled="!hasAnyGroup"
            :loading="hostsLoading"
            @click="openAddInitiator"
          />
          <UButton
            size="sm"
            color="primary"
            variant="outline"
            icon="i-heroicons-link"
            :label="t('storage.hosts.actions.mapLun')"
            :disabled="!canMapLun"
            :loading="hostsLoading"
            @click="openMapLun"
          />
        </template>
      </div>
    </div>

    <TargetTable :targets="filtered" :loading="pending" />
  </div>
</template>

<script setup lang="ts">
import AddGroupModal from '~/components/targets/AddGroupModal.vue'
import AddInitiatorModal from '~/components/targets/AddInitiatorModal.vue'
import MapLunModal from '~/components/targets/MapLunModal.vue'
import { canMapLunFromOverview } from '~/utils/scst-unmapped-devices'

const { t } = useEsosI18n()
const router = useRouter()
const { overview, pending, refresh: refreshOverview } = useOverview()
const { isEffectiveReadOnly } = useSelectedSan()
const modal = useAppModal()
const toast = useAppToast()
const search = ref('')

const allTargets = computed(() => overview.value?.targets ?? [])

const filtered = computed(() =>
  allTargets.value.filter(target =>
    target.name.toLowerCase().includes(search.value.toLowerCase()),
  ),
)

const hasAnyGroup = computed(() =>
  allTargets.value.some(tg => tg.groups.length > 0),
)

const canMapLun = computed(() =>
  overview.value ? canMapLunFromOverview(overview.value) : false,
)

const wizardTargetRef = ref('')

const {
  loading: hostsLoading,
  createGroup,
  addInitiator,
  mapLun,
  preflightCreateGroup,
  preflightAddInitiator,
  preflightMapLun,
} = useTargetHosts(wizardTargetRef, {
  refresh: async () => {},
  refreshOverview,
})

function preflightCreateForTarget(target: string, group: string) {
  wizardTargetRef.value = target
  return preflightCreateGroup(group)
}

function preflightAddForTarget(
  target: string,
  group: string,
  initiator: string,
  type: import('~/utils/scst-initiator-validation').InitiatorType,
) {
  wizardTargetRef.value = target
  return preflightAddInitiator(group, initiator, type)
}

function preflightMapForTarget(
  target: string,
  group: string,
  lunId: number,
  deviceName: string,
  readOnly: boolean,
) {
  wizardTargetRef.value = target
  return preflightMapLun(group, lunId, deviceName, readOnly)
}

async function openCreateGroup() {
  try {
    const payload = await modal.open<{ targetName: string; groupName: string }>({
      component: AddGroupModal,
      props: {
        title: t('storage.hosts.wizard.createGroup.title') as string,
        targets: allTargets.value,
        loading: hostsLoading.value,
        runPreflight: preflightCreateForTarget,
      },
    })
    wizardTargetRef.value = payload.targetName
    await createGroup(payload.groupName)
    toast.success(t('storage.hosts.toasts.groupCreated') as string, payload.groupName)
    await router.push(`/targets/${encodeURIComponent(payload.targetName)}`)
  } catch (err: unknown) {
    if (err === false || err == null) return
    const e = err as { statusMessage?: string; message?: string }
    toast.error(t('storage.hosts.toasts.errorTitle') as string, e.statusMessage ?? e.message ?? '')
  }
}

async function openAddInitiator() {
  try {
    const payload = await modal.open<{
      targetName: string
      groupName: string
      initiator: string
      type: import('~/utils/scst-initiator-validation').InitiatorType
    }>({
      component: AddInitiatorModal,
      props: {
        targets: allTargets.value,
        loading: hostsLoading.value,
        runPreflight: preflightAddForTarget,
      },
    })
    wizardTargetRef.value = payload.targetName
    await addInitiator(payload.groupName, payload.initiator, payload.type)
    toast.success(t('storage.hosts.toasts.initiatorAdded') as string, payload.initiator)
    await router.push(`/targets/${encodeURIComponent(payload.targetName)}`)
  } catch (err: unknown) {
    if (err === false || err == null) return
    const e = err as { statusMessage?: string; message?: string }
    toast.error(t('storage.hosts.toasts.errorTitle') as string, e.statusMessage ?? e.message ?? '')
  }
}

async function openMapLun() {
  if (!overview.value) return
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
        title: t('storage.hosts.wizard.mapLun.title') as string,
        targets: allTargets.value,
        overview: overview.value,
        loading: hostsLoading.value,
        runPreflight: preflightMapForTarget,
      },
    })
    wizardTargetRef.value = payload.targetName
    await mapLun(payload.groupName, payload.lunId, payload.deviceName, payload.readOnly)
    toast.success(
      t('storage.hosts.luns.toasts.mapped') as string,
      `${payload.deviceName} → LUN ${payload.lunId}`,
    )
    await router.push(`/targets/${encodeURIComponent(payload.targetName)}`)
  } catch (err: unknown) {
    if (err === false || err == null) return
    const e = err as { statusMessage?: string; message?: string }
    toast.error(t('storage.hosts.toasts.errorTitle') as string, e.statusMessage ?? e.message ?? '')
  }
}
</script>
