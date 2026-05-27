import { z } from 'zod'
import { readMultipartFormData } from 'h3'
import { writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  importContainerBinary,
  importUploadedBinary,
} from '~~/server/utils/deployment-binaries-catalog'

const bodySchema = z.object({
  sourcePath: z.string().min(1),
  allowDuplicate: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const contentType = getRequestHeader(event, 'content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await readMultipartFormData(event)
    const filePart = form?.find(p => p.name === 'file' && p.filename && p.data)
    if (!filePart?.filename || !filePart.data) {
      throw createError({ statusCode: 400, message: 'file requis' })
    }
    const allowDuplicate = form?.some(p => p.name === 'allowDuplicate' && p.data?.toString() === 'true')
    const localTemp = join(tmpdir(), `esos-deploy-upload-${randomUUID()}`)
    try {
      await writeFile(localTemp, filePart.data)
      const binary = await importUploadedBinary({
        localTempPath: localTemp,
        originalFilename: filePart.filename,
        allowDuplicate,
      })
      return { ok: true, binary }
    } finally {
      await unlink(localTemp).catch(() => {})
    }
  }

  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? 'Corps invalide' })
  }

  const allowDuplicate = parsed.data.allowDuplicate || query.allowDuplicate === '1' || query.allowDuplicate === 'true'
  const binary = await importContainerBinary({
    sourceRelativePath: parsed.data.sourcePath,
    allowDuplicate,
  })
  return { ok: true, binary }
})
