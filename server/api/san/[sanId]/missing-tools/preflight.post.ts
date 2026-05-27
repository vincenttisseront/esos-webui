import { z } from 'zod'
import { getSSHPool } from '~~/server/utils/ssh-pool'
import { assertSanWritable } from '~~/server/utils/san-request-context'
import { getMissingToolsPackageStatus } from '~~/server/utils/missing-tools-package-store'
import { runMissingToolsPreflight } from '~~/server/utils/raid-missing-tools-preflight'
import { setMissingToolsPlanToken } from '~~/server/utils/missing-tools-preflight-store'
import { randomUUID } from 'node:crypto'

const bodySchema = z.object({
  stagingId: z.string().min(1),
  rootPartition: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  assertSanWritable(sanId)

  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0].message })

  const status = getMissingToolsPackageStatus(parsed.data.stagingId)
  if (!status || status.sanId !== sanId || status.phase !== 'ready' || !status.remoteRpmPath) {
    throw createError({ statusCode: 400, message: 'Package non prêt (upload requis)' })
  }

  const pool = getSSHPool()
  const manager = await pool.getOrCreate(sanId)

  const preflight = await runMissingToolsPreflight({
    manager,
    selectedRootPartition: parsed.data.rootPartition,
  })

  const planToken = randomUUID()
  setMissingToolsPlanToken(parsed.data.stagingId, planToken)

  return {
    stagingId: parsed.data.stagingId,
    rpm: {
      filename: status.filename,
      bytes: status.bytesTotal,
      sha256: status.sha256,
      remoteRpmPath: status.remoteRpmPath,
    },
    preflight,
    planToken,
    confirmationPhrase: `PERSIST PERCCLI ${sanId}`,
  }
})

