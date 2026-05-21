<template>
  <UInput
    :id="resolvedId"
    v-model="model"
    :type="type"
    :name="name"
    :placeholder="placeholder"
    :autocomplete="autocomplete"
    :disabled="disabled || loading"
    :readonly="readonly"
    :autofocus="autofocus"
    :inputmode="inputmode"
    size="md"
    class="w-full"
    :ui="appTextInputUi"
    :aria-describedby="ariaDescribedBy"
    :aria-invalid="invalid ? true : undefined"
  />
</template>

<script setup lang="ts">
import { appTextInputUi } from '~/utils/form-field-styles'

const props = withDefaults(
  defineProps<{
    type?: 'text' | 'password' | 'email' | 'search' | 'tel' | 'url'
    name?: string
    placeholder?: string
    autocomplete?: string
    disabled?: boolean
    loading?: boolean
    readonly?: boolean
    autofocus?: boolean
    inputmode?: string
    id?: string
    invalid?: boolean
  }>(),
  {
    type: 'text',
    name: undefined,
    placeholder: undefined,
    autocomplete: undefined,
    disabled: false,
    loading: false,
    readonly: false,
    autofocus: false,
    inputmode: undefined,
    id: undefined,
    invalid: false,
  },
)

const model = defineModel<string>({ required: true })

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

<style scoped>
:deep(input:-webkit-autofill),
:deep(input:-webkit-autofill:hover),
:deep(input:-webkit-autofill:focus) {
  -webkit-box-shadow: 0 0 0 1000px rgb(248 250 252) inset;
  -webkit-text-fill-color: rgb(15 23 42);
  caret-color: rgb(15 23 42);
  transition: background-color 99999s ease-out;
}
</style>
