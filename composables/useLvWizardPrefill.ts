export interface LvWizardPrefill {
  lvName: string
  vgName?: string
}

const pendingPrefill = ref<LvWizardPrefill | null>(null)

export function useLvWizardPrefill() {
  function requestLvWizardPrefill(prefill: LvWizardPrefill) {
    pendingPrefill.value = prefill
  }

  function consumeLvWizardPrefill(): LvWizardPrefill | null {
    const value = pendingPrefill.value
    pendingPrefill.value = null
    return value
  }

  return {
    pendingPrefill: readonly(pendingPrefill),
    requestLvWizardPrefill,
    consumeLvWizardPrefill,
  }
}
