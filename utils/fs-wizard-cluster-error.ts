import type { ClusterLvmNodeResult } from '~/types/lvm'

export function parseFsFetchError(e: unknown): {
  message: string
  nodeResults: ClusterLvmNodeResult[] | null
} {
  const err = e as {
    data?: { nodeResults?: ClusterLvmNodeResult[] }
    statusMessage?: string
    message?: string
  }
  const nodeResults = err?.data?.nodeResults ?? null
  const message = err?.statusMessage ?? err?.message ?? 'Erreur'
  return { message, nodeResults }
}
