<template>
  <span
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
    :class="badge.classes"
  >
    <UIcon :name="badge.icon" class="w-3 h-3 shrink-0" />
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import type { UserPublic } from '../../utils/types'
import {
  AUTH_SOURCE_BADGE,
  normalizeUserAuthSource,
  type UserAuthSource,
} from '../../utils/users-admin-ui'

const props = defineProps<{
  authSource?: UserPublic['authSource'] | string | null
}>()

const { t } = useEsosI18n()

const source = computed<UserAuthSource>(() => normalizeUserAuthSource(props.authSource))

const badge = computed(() => AUTH_SOURCE_BADGE[source.value])

const label = computed(() => t(`admin.users.authSource.${source.value}`))
</script>
