export function parseNtpConf(content: string): string[] {
  return content
    .split('\n')
    .filter(l => /^server\s+/.test(l))
    .map(l => l.replace(/^server\s+/, '').split(/\s+/)[0])
    .filter(Boolean)
}

export function serializeNtpConf(servers: string[], originalContent: string): string {
  const withoutServers = originalContent
    .split('\n')
    .filter(l => !/^server\s+/.test(l))
    .join('\n')
    .trimEnd()

  const serverLines = servers
    .filter(Boolean)
    .map(s => `server ${s} iburst`)
    .join('\n')

  return withoutServers + '\n' + serverLines + '\n'
}
