<template>
  <div class="space-y-6">
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

    <div v-if="pending && !target" class="text-gray-500 text-sm">
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

      <section>
        <SectionTitle :title="t('storage.targets.detail.sections.accessGroups')" :count="target.groups.length" />
        <div v-if="target.groups.length > 0" class="space-y-3">
          <GroupPanel
            v-for="group in target.groups"
            :key="group.name"
            :group="group"
            :devices-map="devicesMap"
          />
        </div>
        <EmptyState v-else :message="t('storage.targets.detail.empty.noGroups')" icon="👥" />
      </section>
    </template>

    <EmptyState v-else :message="t('storage.targets.detail.empty.notFound')" icon="❓" />
  </div>
</template>

<script setup lang="ts">
import DestructiveModal from '~/components/modals/DestructiveModal.vue'

const { t } = useEsosI18n()
const route = useRoute()
const router = useRouter()
const name = computed(() => decodeURIComponent(route.params.name as string))

const { target, pending, refresh } = useTargetDetail(name)
const { overview, refresh: refreshOverview } = useOverview()
const { isEffectiveReadOnly } = useSelectedSan()
const modal = useAppModal()
const toast = useAppToast()

const devicesMap = computed(() => {
  const map = new Map<string, { handler: string; filename: string }>()
  for (const d of overview.value?.devices ?? []) {
    map.set(d.name, { handler: d.handler, filename: d.filename })
  }
  return map
})

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
    return // dismissed
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
