/**
 * Parser corosync-quorumtool -p — SDD v3.8 §3.2
 */

export interface CorosyncQuorumStatus {
  quorate:   boolean
  quorum:    number
  nodeCount: number
  nodes:     CorosyncNode[]
}

export interface CorosyncNode {
  id:     number
  name:   string
  votes:  number
  local:  boolean
}

/**
 * Parse la sortie texte de `corosync-quorumtool -p`.
 */
export function parseCorosyncQuorumtool(raw: string): CorosyncQuorumStatus {
  if (!raw || raw.includes('UNAVAILABLE') || raw.trim() === '') {
    return { quorate: false, quorum: 0, nodeCount: 0, nodes: [] }
  }

  const lines = raw.split('\n').map(l => l.trim())

  const quorate    = lines.find(l => l.startsWith('Quorate:'))?.includes('Yes') ?? false
  const quorum     = parseInt(lines.find(l => l.startsWith('Quorum:'))?.split(/\s+/)[1] ?? '0')
  const nodeCount  = parseInt(lines.find(l => l.startsWith('Nodes:'))?.split(/\s+/)[1]  ?? '0')

  // Section membership : ligne "Nodeid  Votes  Name"
  const headerIdx = lines.findIndex(
    l => l.startsWith('Nodeid') && l.includes('Votes') && l.includes('Name'),
  )
  const nodes: CorosyncNode[] = []

  if (headerIdx !== -1) {
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/).filter(Boolean)
      if (parts.length < 3) continue
      const id    = parseInt(parts[0])
      const votes = parseInt(parts[1])
      const rest  = parts.slice(2).join(' ')
      const local = rest.includes('(local)')
      const name  = rest.replace('(local)', '').trim()
      if (!isNaN(id)) nodes.push({ id, name, votes, local })
    }
  }

  return { quorate, quorum, nodeCount, nodes }
}
