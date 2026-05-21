import { z } from 'zod'
import { readConfigFiles, NOT_FOUND } from '~~/server/utils/config-reader'
import { writeConfigFile }             from '~~/server/utils/config-writer'
import * as SsmtpParser                from '~~/server/utils/parsers/ssmtp.parser'
import type { SMTPConfig }             from '~~/server/utils/types'
import {
  validateSafeSmtpAuthUser,
  validateSafeSmtpEmail,
  validateSafeSmtpMailHub,
  validateSmtpAuthPass,
} from '~~/server/utils/remote-config-paths'
import { toBackendSmtpAuthMethod } from '~~/utils/smtp-auth-method'

const SSMTP = '/etc/ssmtp/ssmtp.conf'

const bodySchema = z.object({
  alertEmail:   z.string(),
  mailHub:      z.string(),
  authUser:     z.string().optional().default(''),
  authPass:     z.string().optional().default(''),
  useTLS:       z.boolean().optional().default(false),
  useSTARTTLS:  z.boolean().optional().default(false),
  authMethod:   z.enum(['LOGIN', 'PLAIN', 'CRAM-MD5', '', 'none']).optional().default(''),
  fromOverride: z.boolean().optional().default(true),
})

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const body  = await readBody(event)

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0].message })
  }

  const input = parsed.data

  const alertErr = validateSafeSmtpEmail(input.alertEmail)
  if (alertErr) throw createError({ statusCode: 400, message: alertErr })
  const hubErr = validateSafeSmtpMailHub(input.mailHub)
  if (hubErr) throw createError({ statusCode: 400, message: hubErr })
  const userErr = validateSafeSmtpAuthUser(input.authUser)
  if (userErr) throw createError({ statusCode: 400, message: userErr })
  const passErr = validateSmtpAuthPass(input.authPass)
  if (passErr) throw createError({ statusCode: 400, message: passErr })

  // If authPass is empty, preserve the existing password
  let authPass = input.authPass
  if (!authPass) {
    const files   = await readConfigFiles(sanId, [SSMTP])
    const content = files.get(SSMTP)
    if (content && content !== NOT_FOUND) {
      const m = content.match(/^AuthPass=(.+)/m)
      if (m) authPass = m[1].trim()
    }
  }

  const config: SMTPConfig = {
    alertEmail:   input.alertEmail,
    mailHub:      input.mailHub,
    authUser:     input.authUser,
    authPass,
    useTLS:       input.useTLS,
    useSTARTTLS:  input.useSTARTTLS,
    authMethod:   toBackendSmtpAuthMethod(input.authMethod),
    fromOverride: input.fromOverride,
  }

  const content = SsmtpParser.serializeSsmtpConf(config)
  await writeConfigFile(sanId, SSMTP, content)

  return { ok: true }
})
