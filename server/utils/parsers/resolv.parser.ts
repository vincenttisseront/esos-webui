export function parseResolvConf(content: string): { nameservers: string[]; search: string } {
  const nameservers: string[] = []
  let search = ''
  for (const line of content.split('\n')) {
    const m = line.match(/^nameserver\s+(\S+)/)
    if (m) nameservers.push(m[1])
    const s = line.match(/^search\s+(.+)/)
    if (s) search = s[1].trim()
  }
  return { nameservers, search }
}

export function serializeResolvConf(nameservers: string[], search: string): string {
  const lines: string[] = []
  if (search) lines.push(`search ${search}`)
  for (const ns of nameservers.filter(Boolean)) {
    lines.push(`nameserver ${ns}`)
  }
  return lines.join('\n') + '\n'
}
