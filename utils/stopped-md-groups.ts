import type { StoppedMdArray } from '~/types/raid'

export function groupStoppedMdArrays(arrays: StoppedMdArray[]) {
  const assemblable = arrays.filter(a => a.category === 'assemblable')
  const incompleteOrphan = arrays.filter(a => a.category !== 'assemblable')
  return { assemblable, incompleteOrphan }
}

export function resolveAssembleMdName(arr: StoppedMdArray, overrideName?: string): string {
  const candidate = overrideName?.trim() || arr.name || arr.arrayTargetPath?.replace(/^\/dev\//, '') || ''
  return candidate
}

export function resolveZeroConfirmationName(arr: StoppedMdArray): string {
  if (arr.name && /^md\d+$/i.test(arr.name)) return arr.name
  const fromPath = arr.arrayTargetPath?.replace(/^\/dev\//, '')
  if (fromPath && /^md\d+$/i.test(fromPath)) return fromPath
  return 'md0'
}

export function resolveInspectLabel(arr: StoppedMdArray, t: (key: string) => string): string {
  const titleKey = `raid.stopped_md.title.${arr.displayKind}`
  const title = t(titleKey)
  return arr.displaySubtitle ? `${title} — ${arr.displaySubtitle}` : title
}
