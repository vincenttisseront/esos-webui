import { z } from 'zod'
import { getSSHPool } from '~~/server/utils/ssh-pool'
import { assertSanWritable } from '~~/server/utils/san-request-context'
import { getMissingToolsPackageStatus } from '~~/server/utils/missing-tools-package-store'
import { addMissingToolsOperation, getMissingToolsOperation, updateMissingToolsOperation } from '~~/server/utils/missing-tools-operations-store'
import { runPerccliTempInstall } from '~~/server/utils/raid-missing-tools-temp-install'

const bodySchema = z.object({
  stagingId: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  assertSanWritable(sanId)

  const userId = event.context.user?.id ?? 'unknown'

  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0].message })

  const status = getMissingToolsPackageStatus(parsed.data.stagingId)
  if (!status || status.sanId !== sanId || status.phase !== 'ready' || !status.remoteRpmPath) {
    throw createError({ statusCode: 400, message: 'Package non prêt (upload requis)' })
  }

  const pool = getSSHPool()
  const manager = await pool.getOrCreate(sanId)

  const op = await runPerccliTempInstall({
    manager,
    sanId,
    stagingId: parsed.data.stagingId,
    remoteRpmPath: status.remoteRpmPath,
    createdBy: userId,
    onUpdate: (next) => {
      if (!next.id) return
      if (getMissingToolsOperation(next.id)) updateMissingToolsOperation(next.id, next)
      else addMissingToolsOperation(next)
    },
  })

  // ensure persisted
  if (!getMissingToolsOperation(op.id)) addMissingToolsOperation(op)
  return { operationId: op.id }
})

