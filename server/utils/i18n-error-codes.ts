/**
 * Inventory of API error codes returned in `createError({ data: { code } })` or equivalent.
 * Used by tests/i18n-error-codes.test.ts — keep in sync when adding new codes.
 */
export const KNOWN_API_ERROR_CODES = [
  'auth.missing_credentials',
  'auth.invalid_credentials',
  'auth.inactive',
  'auth.unsupported_locale',
  'san.read_only',
  'ssh.not_connected',
  'rbac.forbidden',
  'targets.missing_name',
  'CLUSTER_MEMBER',
  'lvm.scst_device_conflict',
  'scst.group_has_luns',
  'INVALID_PATH',
  'INVALID_FILENAME',
  'FILE_EXISTS',
  'DUPLICATE_SHA256',
  'BINARY_MISSING',
] as const

export type KnownApiErrorCode = (typeof KNOWN_API_ERROR_CODES)[number]

/** Maps non-dotted or legacy codes to vue-i18n keys under `errors.*` */
export const API_ERROR_CODE_I18N_ALIASES: Record<string, string> = {
  CLUSTER_MEMBER: 'errors.cluster.member_blocked',
}
