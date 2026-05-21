import type { RaidI18nMessage } from '~/types/raid'

export type RaidTranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string

export function translateRaidI18n(msg: RaidI18nMessage, t: RaidTranslateFn): string {
  return t(msg.code, msg.params ?? {})
}
