import { getRouterParam } from 'h3'
import { issueWsTerminalTicket } from '../../../../utils/ws-terminal-ticket'
import { isTerminalWebSocketRoleAllowed } from '../../../../utils/session-auth'

export default defineEventHandler((event) => {
  const user = event.context.user
  if (!user) {
    throw createError({ statusCode: 401, message: 'Non authentifié' })
  }
  if (!isTerminalWebSocketRoleAllowed(user.role)) {
    throw createError({ statusCode: 403, message: 'Droits insuffisants pour le terminal' })
  }

  const sanId = (getRouterParam(event, 'sanId') ?? '').trim()
  if (!sanId) {
    throw createError({ statusCode: 400, message: 'sanId requis' })
  }

  const ticket = issueWsTerminalTicket(user.id, sanId)
  return { ticket, expiresInSec: 30 }
})
