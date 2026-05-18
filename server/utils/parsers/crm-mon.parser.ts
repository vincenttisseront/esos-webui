/**
 * Parser crm_mon XML — SDD v3.8 §3.1
 * Utilise fast-xml-parser pour décoder la sortie de :
 *   crm_mon --output-as=xml --one-shot -r
 */
import { XMLParser } from 'fast-xml-parser'
import type { ClusterResource, ALUAState, ResourceState } from '../types'

export interface CrmMonResult {
  clusterName:  string
  dcNode:       string | null
  quorum:       boolean
  nodes:        CrmNode[]
  resources:    ClusterResource[]
}

export interface CrmNode {
  id:          string
  name:        string
  type:        'member' | 'ping' | 'remote'
  online:      boolean
  standby:     boolean
  maintenance: boolean
  dcNode:      boolean
}

const XML_OPTIONS = {
  ignoreAttributes:    false,
  attributeNamePrefix: '@_',
  isArray: (name: string) => ['node', 'resource', 'clone', 'ms', 'group'].includes(name),
}

export function parseCrmMonXml(xml: string): CrmMonResult {
  if (!xml || xml.includes('<crm_mon_error/>')) return emptyResult()

  const parser = new XMLParser(XML_OPTIONS)
  let doc: any
  try {
    doc = parser.parse(xml)
  } catch {
    return emptyResult()
  }

  const root      = doc?.crm_mon ?? {}
  const summary   = root.summary ?? {}
  const nodesEl   = root.nodes?.node ?? []
  const resSection = root.resources ?? {}

  // ── Nœuds ──────────────────────────────────────────────────────────────────
  const nodes: CrmNode[] = nodesEl.map((n: any) => ({
    id:          n['@_id']    ?? n['@_name'] ?? '',
    name:        n['@_name']  ?? '',
    type:        n['@_type']  ?? 'member',
    online:      n['@_online']      === 'true',
    standby:     n['@_standby']     === 'true',
    maintenance: n['@_maintenance'] === 'true',
    dcNode:      n['@_is_dc']       === 'true',
  }))

  // ── Ressources ─────────────────────────────────────────────────────────────
  const resources: ClusterResource[] = []
  extractResources(resSection, resources)

  // ── Quorum ─────────────────────────────────────────────────────────────────
  const dcInfo = summary.current_dc ?? {}
  const quorum = dcInfo['@_with_quorum'] === 'true'
  const dcNode = nodes.find(n => n.dcNode)?.name ?? null

  return {
    clusterName: summary.cluster_name?.['@_name'] ?? '',
    dcNode,
    quorum,
    nodes,
    resources,
  }
}

// ── Extraction récursive ────────────────────────────────────────────────────

function extractResources(section: any, out: ClusterResource[]): void {
  for (const r of (section.resource ?? [])) {
    out.push(mapResource(r))
  }
  for (const clone of (section.clone ?? [])) {
    for (const r of (clone.resource ?? [])) {
      out.push(mapResource(r))
    }
  }
  for (const ms of (section.ms ?? [])) {
    for (const r of (ms.resource ?? [])) {
      out.push(mapResource(r))
    }
  }
  for (const grp of (section.group ?? [])) {
    extractResources(grp, out)
  }
}

function mapResource(r: any): ClusterResource {
  const roleRaw = r['@_role'] as string | undefined
  const roleMap: Record<string, ResourceState> = {
    Started: 'Started', Stopped: 'Stopped',
    Master:  'Master',  Slave:   'Slave',
  }
  const nodeEl = Array.isArray(r.node) ? r.node[0] : r.node
  return {
    id:      r['@_id']             ?? '',
    type:    (r['@_resource_agent'] ?? '').replace('::', ':'),
    state:   roleMap[roleRaw ?? ''] ?? 'Unknown',
    active:  r['@_active']  === 'true',
    managed: r['@_managed'] === 'true',
    node:    nodeEl?.['@_name'] ?? '',
  }
}

function emptyResult(): CrmMonResult {
  return { clusterName: '', dcNode: null, quorum: false, nodes: [], resources: [] }
}
