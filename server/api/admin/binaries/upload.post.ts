import { readMultipartFormData } from 'h3'
import { uploadBinaryToContainer } from '~~/server/utils/deployment-binaries-service'
import { mapBinaryUploadFsError } from '~~/server/utils/deployment-binaries-storage'

export default defineEventHandler(async (event) => {
  let form
  try {
    form = await readMultipartFormData(event)
  } catch (err) {
    throw createError({
      statusCode: 400,
      message: 'Corps multipart invalide',
      data: { code: 'UPLOAD_PARSE_FAILED' },
    })
  }

  const filePart = form?.find(p => p.name === 'file' && p.filename && p.data?.length)
  if (!filePart?.filename || !filePart.data) {
    throw createError({
      statusCode: 400,
      message: 'Champ file requis',
      data: { code: 'UPLOAD_FILE_REQUIRED' },
    })
  }

  try {
    const binary = await uploadBinaryToContainer(filePart.filename, filePart.data)
    return {
      ok: true,
      filename: binary.filename,
      sizeBytes: binary.sizeBytes,
      sha256: binary.sha256,
      storedPath: binary.storedPath,
      id: binary.id,
      binary,
    }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'statusCode' in err) throw err
    mapBinaryUploadFsError(err)
  }
})
