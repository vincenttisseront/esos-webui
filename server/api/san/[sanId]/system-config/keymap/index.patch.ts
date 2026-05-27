import { z } from 'zod'
import { assertSanWritable } from '~~/server/utils/san-request-context'
import {
  isKeymapAllowed,
  readConsoleKeymapInfo,
  saveAndApplyConsoleKeymap,
  validateKeymapId,
} from '~~/server/utils/console-keymap'

const bodySchema = z.object({
  keymap: z.string().min(1, 'Keymap requis'),
})

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  assertSanWritable(sanId)

  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0].message })
  }

  const keymap = parsed.data.keymap.trim()
  const err = validateKeymapId(keymap)
  if (err) throw createError({ statusCode: 400, message: err })

  const info = await readConsoleKeymapInfo(sanId)
  if (info.status !== 'ok') {
    throw createError({ statusCode: 503, message: info.error.message })
  }
  if (!info.data.loadkeysPresent) {
    throw createError({ statusCode: 400, message: 'loadkeys non disponible sur ce système' })
  }
  if (!isKeymapAllowed(keymap, info.data)) {
    throw createError({ statusCode: 400, message: 'Keymap non supporté' })
  }

  await saveAndApplyConsoleKeymap(sanId, keymap)
  return { ok: true }
})

