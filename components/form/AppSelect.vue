<template>
  <USelect
    :id="resolvedId"
    v-model="model"
    :items="items"
    :placeholder="placeholder"
    :disabled="disabled || loading"
    size="md"
    class="w-full"
    :ui="appSelectUi"
    :aria-describedby="ariaDescribedBy"
    :aria-invalid="invalid ? true : undefined"
  />
</template>

<script setup lang="ts">
import { appSelectUi } from '~/utils/form-field-styles'

const props = withDefaults(
  defineProps<{
    items: Array<{ label: string; value: string } | string>
    placeholder?: string
    disabled?: boolean
    loading?: boolean
    id?: string
    invalid?: boolean
  }>(),
  {
    placeholder: undefined,
    disabled: false,
    loading: false,
    id: undefined,
    invalid: false,
  },
)

const model = defineModel<string | null>({ required: true })

const injectedFieldId = inject<Ref<string> | undefined>('appFormFieldControlId', undefined)
const injectedHelpId = inject<Ref<string | undefined> | undefined>('appFormFieldHelpId', undefined)
const injectedErrorId = inject<Ref<string | undefined> | undefined>('appFormFieldErrorId', undefined)

const autoId = useId()
const resolvedId = computed(() => props.id ?? injectedFieldId?.value ?? autoId.replace(/:/g, ''))

const ariaDescribedBy = computed(() => {
  const ids: string[] = []
  const help = injectedHelpId?.value
  const err = injectedErrorId?.value
  if (help) ids.push(help)
  if (err) ids.push(err)
  return ids.length ? ids.join(' ') : undefined
})
</script>
