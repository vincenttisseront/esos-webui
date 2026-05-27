import { readMultipartFormData } from 'h3'
import { uploadBinaryToContainer } from '~~/server/utils/deployment-binaries-service'

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event)
  const filePart = form?.find(p => p.name === 'file' && p.filename && p.data)
  if (!filePart?.filename || !filePart.data) {
    throw createError({ statusCode: 400, message: 'Champ file requis' })
  }

  const binary = await uploadBinaryToContainer(filePart.filename, filePart.data)
  return { ok: true, binary }
})
