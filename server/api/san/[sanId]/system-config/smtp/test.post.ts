import { readConfigFiles, NOT_FOUND } from '~~/server/utils/config-reader'
import { runCommand }                  from '~~/server/utils/config-writer'
import { shellSingleQuoteForRemote, validateSafeSmtpEmail } from '~~/server/utils/remote-config-paths'

const SSMTP = '/etc/ssmtp/ssmtp.conf'

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!

  // Read the alert email from ssmtp.conf (root=)
  const files   = await readConfigFiles(sanId, [SSMTP])
  const content = files.get(SSMTP)

  if (!content || content === NOT_FOUND) {
    throw createError({ statusCode: 404, message: 'ssmtp.conf introuvable' })
  }

  const m = content.match(/^root=(.+)/m)
  if (!m) {
    throw createError({ statusCode: 400, message: 'Aucun email destinataire configuré (root=)' })
  }

  const recipient = m[1].trim()

  const recipientErr = validateSafeSmtpEmail(recipient)
  if (recipientErr) {
    throw createError({ statusCode: 400, message: `Destinataire invalide dans ssmtp.conf : ${recipientErr}` })
  }

  const recipientQ = shellSingleQuoteForRemote(recipient)

  let stdout = '', stderr = ''
  try {
    ;({ stdout, stderr } = await runCommand(
      sanId,
      `printf '%b' 'Subject: ESOS WebUI - Test SMTP\\n\\nCeci est un message de test envoyé depuis ESOS WebUI.\\n' | ssmtp ${recipientQ} 2>&1`,
      true,
      30_000,
    ))
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) }
  }

  const output = (stderr + '\n' + stdout).trim()
  if (output) {
    return { ok: false, error: output }
  }

  return { ok: true, recipient }
})
