import { getRequestHeader, sendRedirect } from 'h3'
import { tryEstablishHeaderSession } from '../../../utils/header-session'

function wantsHtml(event: Parameters<typeof tryEstablishHeaderSession>[0]): boolean {
  const accept = getRequestHeader(event, 'accept') ?? ''
  return accept.includes('text/html') || accept.includes('application/xhtml+xml')
}

export default defineEventHandler(async (event) => {
  const result = await tryEstablishHeaderSession(event)
  if (result.ok) {
    if (wantsHtml(event)) {
      return sendRedirect(event, '/', 302)
    }
    return { ok: true as const }
  }

  if (wantsHtml(event)) {
    return sendRedirect(event, '/login?error=header_denied', 302)
  }

  throw createError({
    statusCode: 401,
    message:    result.message ?? 'Header SSO denied',
  })
})
