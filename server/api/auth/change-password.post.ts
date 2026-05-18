import { SESSION_COOKIE, verifySession } from '../../utils/jwt'
import { getUserById, updatePassword } from '../../db/repositories/user.repository'
import { buildPasswordComplexityMessage } from '~/utils/password-policy'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE.name)
  if (!token) {
    throw createError({ statusCode: 401, message: 'Non authentifié' })
  }

  let payload
  try {
    payload = await verifySession(token)
  } catch {
    throw createError({ statusCode: 401, message: 'Session invalide' })
  }

  const account = await getUserById(payload.userId)
  if (account && account.authSource !== 'local') {
    throw createError({
      statusCode: 400,
      message: 'Mot de passe géré par le fournisseur d’identité (LDAP/OIDC).',
    })
  }

  const body = await readBody<{ newPassword?: string }>(event)
  if (!body?.newPassword) {
    throw createError({
      statusCode: 400,
      message: 'Le nouveau mot de passe est requis',
    })
  }

  const complexityMessage = buildPasswordComplexityMessage(body.newPassword)
  if (complexityMessage) {
    throw createError({ statusCode: 400, message: complexityMessage })
  }

  await updatePassword(payload.userId, body.newPassword)
  return { ok: true }
})
