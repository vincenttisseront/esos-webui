// composables/useAppToast.ts
// Surcouche de useToast() avec des helpers sémantiques.
// Les helpers success / error / warning / info attendent du texte déjà traduit
// (ex. `success(t('banner.network.toast_verify_ok_title'), t('…'))`).

type ToastFn = (title: string, description?: string) => void

export function useAppToast() {
  const toast = useToast()
  const { t } = useEsosI18n()

  const success: ToastFn = (title, description) => toast.add({
    title,
    description,
    icon:  'i-heroicons-check-circle',
    color: 'green',
    timeout: 4000,
  })

  const error: ToastFn = (title, description) => toast.add({
    title,
    description,
    icon:    'i-heroicons-x-circle',
    color:   'red',
    timeout: 6000,   // Plus long pour les erreurs
  })

  const warning: ToastFn = (title, description) => toast.add({
    title,
    description,
    icon:    'i-heroicons-exclamation-triangle',
    color:   'amber',
    timeout: 5000,
  })

  const info: ToastFn = (title, description) => toast.add({
    title,
    description,
    icon:    'i-heroicons-information-circle',
    color:   'blue',
    timeout: 4000,
  })

  // Toast spécial : SSH reconnecté
  function sshReconnected() {
    toast.add({
      title:       t('toast.ssh.reconnected.title'),
      description: t('toast.ssh.reconnected.description'),
      icon:        'i-heroicons-signal',
      color:       'green',
      timeout:     3000,
    })
  }

  // Toast spécial : SSH perdu
  function sshLost() {
    toast.add({
      title:       t('toast.ssh.lost.title'),
      description: t('toast.ssh.lost.description'),
      icon:        'i-heroicons-signal-slash',
      color:       'red',
      timeout:     0,   // Persist jusqu'à dismiss manuel
    })
  }

  return { success, error, warning, info, sshReconnected, sshLost }
}
