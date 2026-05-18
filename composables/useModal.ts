// composables/useModal.ts
import { ref, markRaw, type Component } from 'vue'

interface ModalOptions {
  component: Component
  props?:    Record<string, unknown>
}

interface ModalEntry {
  id:        string
  component: Component
  props:     Record<string, unknown>
  resolve:   (value: unknown) => void
  reject:    (reason?: unknown) => void
}

// Pile de modales (support multi-niveaux)
const stack = ref<ModalEntry[]>([])

function open<T = void>(options: ModalOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    stack.value.push({
      id:        crypto.randomUUID(),
      component: markRaw(options.component),
      props:     options.props ?? {},
      resolve:   resolve as (v: unknown) => void,
      reject,
    })
  })
}

function close(id: string, result?: unknown): void {
  const idx   = stack.value.findIndex(m => m.id === id)
  if (idx === -1) return
  const entry = stack.value[idx]
  stack.value.splice(idx, 1)
  entry.resolve(result)
}

function dismiss(id: string): void {
  const idx   = stack.value.findIndex(m => m.id === id)
  if (idx === -1) return
  const entry = stack.value[idx]
  stack.value.splice(idx, 1)
  entry.reject(new Error('dismissed'))
}

export function useAppModal() {
  return { open, close, dismiss, stack }
}

// ─── Helpers rapides ─────────────────────────────────────────────────────────

export async function modalConfirm(options: {
  title:        string
  message:      string
  confirmLabel?: string
  cancelLabel?:  string
  intent?:      'neutral' | 'danger'
}): Promise<boolean> {
  const { default: ConfirmModal } = await import('~/components/modals/ConfirmModal.vue')
  try {
    await open({ component: ConfirmModal, props: options })
    return true
  } catch {
    return false    // dismiss = false
  }
}

export async function modalAlert(options: {
  title:   string
  message: string
  level?:  'info' | 'warning' | 'error'
}): Promise<void> {
  const { default: AlertModal } = await import('~/components/modals/AlertModal.vue')
  try {
    await open({ component: AlertModal, props: options })
  } catch { /* dismissed */ }
}

export async function modalDestructive(options: {
  title:         string
  message:       string
  confirmLabel?: string
  inputConfirm?: string   // Si défini : l'utilisateur doit taper ce texte pour confirmer
}): Promise<boolean> {
  const { default: DestructiveModal } = await import('~/components/modals/DestructiveModal.vue')
  try {
    await open({ component: DestructiveModal, props: { ...options, persistent: true } })
    return true
  } catch {
    return false
  }
}

export async function modalPasswordConfirm(options: {
  title:         string
  message:       string
  confirmLabel?: string
  cancelLabel?:  string
  intent?:       'neutral' | 'danger'
}): Promise<string | false> {
  const { default: PasswordConfirmModal } = await import('~/components/modals/PasswordConfirmModal.vue')
  try {
    const result = await open<string>({ component: PasswordConfirmModal, props: { ...options, persistent: true } })
    return result
  } catch {
    return false
  }
}
