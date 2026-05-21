import { createError, getRouterParam, type H3Event } from 'h3'
import { hasConfiguredSSH, withSanContext } from './ssh-runtime'
import { requireSanIdQuery } from './san-query'

export function decodeTargetParam(event: H3Event): string {
  const name = decodeURIComponent(getRouterParam(event, 'name') ?? '')
  if (!name) {
    throw createError({ statusCode: 400, message: 'name requis' })
  }
  return name
}

export function decodeGroupParam(event: H3Event): string {
  const groupName = decodeURIComponent(getRouterParam(event, 'groupName') ?? '')
  if (!groupName) {
    throw createError({ statusCode: 400, message: 'groupName requis' })
  }
  return groupName
}

export async function requireScstMutationContext(
  event: Parameters<typeof requireSanIdQuery>[0],
  fn: () => Promise<unknown>,
): Promise<unknown> {
  if (!(await hasConfiguredSSH())) {
    throw createError({ statusCode: 503, message: 'SSH non configuré' })
  }
  const sanId = requireSanIdQuery(event)
  try {
    return await withSanContext(sanId, fn)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    if (/existe déjà|déjà présent|déjà utilisé/i.test(msg)) {
      throw createError({ statusCode: 409, message: msg })
    }
    if (/contient.*LUN/i.test(msg)) {
      throw createError({ statusCode: 409, message: msg, data: { code: 'scst.group_has_luns' } })
    }
    throw createError({ statusCode: 422, message: msg })
  }
}

export function mapScstError(err: unknown): never {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    throw err
  }
  const msg = err instanceof Error ? err.message : 'Erreur inconnue'
  throw createError({ statusCode: 422, message: msg })
}
