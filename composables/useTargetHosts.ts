import type { Ref } from 'vue'
import type { ClusterLvmNodeResult } from '~/types/lvm'
import type { ScstPreflightResult } from '~/types/scst-hosts'
import type { InitiatorType } from '~/utils/scst-initiator-validation'
import { extractNodeResults } from '~/utils/scst-hosts-ui'

export type HostsMutationResult = {
  nodeResults?: ClusterLvmNodeResult[]
}

export function useTargetHosts(
  targetName: Ref<string>,
  hooks: { refresh: () => Promise<void>; refreshOverview: () => Promise<void> },
) {
  const { effective, selectedCluster } = useSelectedSan()
  const loading = ref(false)
  const lastNodeResults = ref<ClusterLvmNodeResult[] | null>(null)

  const isClusterMode = computed(
    () => !!selectedCluster.value || !!effective.value?.clusterId,
  )

  const clusterCtx = computed(() => {
    const clusterId = selectedCluster.value?.id ?? effective.value?.clusterId
    const primarySanId = effective.value?.id
    if (!clusterId || !primarySanId) return null
    return { clusterId, primarySanId }
  })

  function sanQuery() {
    const id = effective.value?.id
    return id ? { query: { sanId: id } } : {}
  }

  const enc = (s: string) => encodeURIComponent(s)

  async function afterMutation(result?: HostsMutationResult) {
    lastNodeResults.value = result?.nodeResults ?? null
    await hooks.refresh()
    await hooks.refreshOverview()
  }

  async function createGroup(groupName: string): Promise<HostsMutationResult> {
    loading.value = true
    try {
      if (isClusterMode.value && clusterCtx.value) {
        const res = await $fetch<HostsMutationResult>(
          `/api/targets/${enc(targetName.value)}/groups/cluster`,
          {
            method: 'POST',
            body: { groupName, ...clusterCtx.value },
          },
        )
        await afterMutation(res)
        return res
      }
      await $fetch(`/api/targets/${enc(targetName.value)}/groups`, {
        method: 'POST',
        body: { groupName },
        ...sanQuery(),
      })
      await afterMutation()
      return {}
    } finally {
      loading.value = false
    }
  }

  async function deleteGroup(
    groupName: string,
    opts?: { force?: boolean; confirmation?: string },
  ): Promise<HostsMutationResult> {
    loading.value = true
    try {
      if (isClusterMode.value && clusterCtx.value) {
        const res = await $fetch<HostsMutationResult>(
          `/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}/cluster`,
          {
            method: 'DELETE',
            body: { ...clusterCtx.value, ...opts },
          },
        )
        await afterMutation(res)
        return res
      }
      await $fetch(`/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}`, {
        method: 'DELETE',
        body: opts,
        ...sanQuery(),
      })
      await afterMutation()
      return {}
    } finally {
      loading.value = false
    }
  }

  async function addInitiator(
    groupName: string,
    initiator: string,
    type?: InitiatorType,
  ): Promise<HostsMutationResult> {
    loading.value = true
    try {
      if (isClusterMode.value && clusterCtx.value) {
        const res = await $fetch<HostsMutationResult>(
          `/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}/initiators/cluster`,
          {
            method: 'POST',
            body: { initiator, type, ...clusterCtx.value },
          },
        )
        await afterMutation(res)
        return res
      }
      await $fetch(
        `/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}/initiators`,
        {
          method: 'POST',
          body: { initiator, type },
          ...sanQuery(),
        },
      )
      await afterMutation()
      return {}
    } finally {
      loading.value = false
    }
  }

  async function removeInitiator(
    groupName: string,
    initiator: string,
  ): Promise<HostsMutationResult> {
    loading.value = true
    try {
      if (isClusterMode.value && clusterCtx.value) {
        const res = await $fetch<HostsMutationResult>(
          `/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}/initiators/cluster.remove`,
          {
            method: 'POST',
            body: { initiator, ...clusterCtx.value },
          },
        )
        await afterMutation(res)
        return res
      }
      await $fetch(
        `/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}/initiators/remove`,
        {
          method: 'POST',
          body: { initiator },
          ...sanQuery(),
        },
      )
      await afterMutation()
      return {}
    } finally {
      loading.value = false
    }
  }

  async function mapLun(
    groupName: string,
    lunId: number,
    deviceName: string,
    readOnly?: boolean,
  ): Promise<HostsMutationResult> {
    loading.value = true
    try {
      if (isClusterMode.value && clusterCtx.value) {
        const res = await $fetch<HostsMutationResult>(
          `/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}/luns/cluster`,
          {
            method: 'POST',
            body: { lunId, deviceName, readOnly, ...clusterCtx.value },
          },
        )
        await afterMutation(res)
        return res
      }
      await $fetch(
        `/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}/luns`,
        {
          method: 'POST',
          body: { lunId, deviceName, readOnly },
          ...sanQuery(),
        },
      )
      await afterMutation()
      return {}
    } finally {
      loading.value = false
    }
  }

  async function unmapLun(groupName: string, lunId: number): Promise<HostsMutationResult> {
    loading.value = true
    try {
      if (isClusterMode.value && clusterCtx.value) {
        const res = await $fetch<HostsMutationResult>(
          `/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}/luns/cluster.remove`,
          {
            method: 'POST',
            body: { lunId, ...clusterCtx.value },
          },
        )
        await afterMutation(res)
        return res
      }
      await $fetch(
        `/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}/luns/remove`,
        {
          method: 'POST',
          body: { lunId },
          ...sanQuery(),
        },
      )
      await afterMutation()
      return {}
    } finally {
      loading.value = false
    }
  }

  async function fetchUnmappedDevices(): Promise<import('~/types/scst-hosts').UnmappedDeviceInfo[]> {
    const res = await $fetch<{ devices: import('~/types/scst-hosts').UnmappedDeviceInfo[] }>(
      `/api/targets/${enc(targetName.value)}/unmapped-devices`,
      sanQuery(),
    )
    return res.devices
  }

  async function fetchDiscovered(): Promise<string[]> {
    const res = await $fetch<{ initiators: string[] }>(
      `/api/targets/${enc(targetName.value)}/discovered-initiators`,
      sanQuery(),
    )
    return res.initiators
  }

  async function preflightCreateGroup(groupName: string): Promise<ScstPreflightResult> {
    return $fetch<ScstPreflightResult>(
      `/api/targets/${enc(targetName.value)}/groups/preflight`,
      {
        method: 'POST',
        body: { action: 'create_group', groupName },
        ...sanQuery(),
      },
    )
  }

  async function preflightDeleteGroup(groupName: string): Promise<ScstPreflightResult> {
    return $fetch<ScstPreflightResult>(
      `/api/targets/${enc(targetName.value)}/groups/preflight`,
      {
        method: 'POST',
        body: { action: 'delete_group', groupName },
        ...sanQuery(),
      },
    )
  }

  async function preflightAddInitiator(
    groupName: string,
    initiator: string,
    type?: InitiatorType,
  ): Promise<ScstPreflightResult> {
    return $fetch<ScstPreflightResult>(
      `/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}/initiators/preflight`,
      {
        method: 'POST',
        body: { action: 'add', initiator, type },
        ...sanQuery(),
      },
    )
  }

  async function preflightRemoveInitiator(
    groupName: string,
    initiator: string,
  ): Promise<ScstPreflightResult> {
    return $fetch<ScstPreflightResult>(
      `/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}/initiators/preflight`,
      {
        method: 'POST',
        body: { action: 'remove', initiator },
        ...sanQuery(),
      },
    )
  }

  async function preflightMapLun(
    groupName: string,
    lunId: number,
    deviceName: string,
    readOnly?: boolean,
  ): Promise<ScstPreflightResult> {
    return $fetch<ScstPreflightResult>(
      `/api/targets/${enc(targetName.value)}/groups/${enc(groupName)}/luns/preflight`,
      {
        method: 'POST',
        body: { lunId, deviceName, readOnly },
        ...sanQuery(),
      },
    )
  }

  return {
    loading,
    isClusterMode,
    clusterCtx,
    lastNodeResults,
    createGroup,
    deleteGroup,
    addInitiator,
    removeInitiator,
    mapLun,
    unmapLun,
    fetchUnmappedDevices,
    fetchDiscovered,
    preflightCreateGroup,
    preflightDeleteGroup,
    preflightAddInitiator,
    preflightRemoveInitiator,
    preflightMapLun,
    extractNodeResults,
  }
}
