import { SESSION_COOKIE } from '../../utils/jwt'

export default defineEventHandler((event) => {
  deleteCookie(event, SESSION_COOKIE.name, {
    httpOnly: true,
    path: '/',
  })
  return { ok: true }
})
