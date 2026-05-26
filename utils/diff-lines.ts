/** Simple line diff for config preview (not a full Myers diff). */
export function diffLines(before: string, after: string): string[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const out: string[] = []
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    const la = a[i]
    const lb = b[i]
    if (la === lb) {
      if (la !== undefined) out.push(`  ${la}`)
    } else {
      if (la !== undefined) out.push(`- ${la}`)
      if (lb !== undefined) out.push(`+ ${lb}`)
    }
  }
  return out
}
