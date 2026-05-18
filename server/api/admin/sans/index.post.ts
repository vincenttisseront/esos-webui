import {
  createSan,
  type CreateSanInput,
  type AuthType,
} from '../../../db/repositories/san.repository'

interface CreateSanBody extends Partial<CreateSanInput> {
  authType?: AuthType
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateSanBody>(event)

  // Validation
  const required = ['label', 'host', 'username', 'authType'] as const
  for (const field of required) {
    if (!body?.[field]) {
      throw createError({
        statusCode: 400,
        statusMessage: `Champ requis manquant : ${field}`,
      })
    }
  }

  if (body.authType === 'key' && !body.privateKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'privateKey requis pour authType="key"',
    })
  }
  if (body.authType === 'password' && !body.password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'password requis pour authType="password"',
    })
  }

  try {
    const id = createSan({
      label: body.label!,
      description: body.description,
      host: body.host!,
      port: body.port,
      username: body.username!,
      driver: body.driver,
      authType: body.authType!,
      privateKey: body.privateKey,
      password: body.password,
      settings: body.settings,
    })
    setResponseStatus(event, 201)
    return { id }
  } catch (err) {
    throw createError({
      statusCode: 500,
      statusMessage: (err as Error).message,
    })
  }
})
