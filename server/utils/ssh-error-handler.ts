import { getRuntimeSSHState } from './ssh-runtime'

/**
 * Normalises SSH errors into HTTP responses (cf. SDD v1.4 §10.1).
 * Always throws — return type is `never`.
 */
export function handleSSHError(err: unknown): never {
  const { status } = getRuntimeSSHState()

  if (status === 'connecting' || status === 'reconnecting') {
    throw createError({
      statusCode: 503,
      statusMessage: 'ESOS SSH connection is being re-established',
      data: { sshStatus: status, message: (err as Error)?.message },
    })
  }

  if (status === 'error') {
    throw createError({
      statusCode: 503,
      statusMessage: 'ESOS SSH connection unavailable',
      data: { sshStatus: status, message: (err as Error)?.message },
    })
  }

  const message = (err as Error)?.message ?? ''
  if (/timeout/i.test(message)) {
    throw createError({
      statusCode: 504,
      statusMessage: 'ESOS command timed out',
      data: { sshStatus: status, message },
    })
  }

  throw createError({
    statusCode: 500,
    statusMessage: 'ESOS command execution failed',
    data: { sshStatus: status, message },
  })
}
