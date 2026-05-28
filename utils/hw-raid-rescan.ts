export function resolveRescanHost(input: {
  requestedHost?: string
  scsiAddress?: string
}): string | null {
  const requested = input.requestedHost?.trim()
  if (requested && /^\d+$/.test(requested)) return requested
  const fromScsi = input.scsiAddress?.match(/^(\d+):/)?.[1]
  return fromScsi ?? null
}
