import { ref, watchEffect, type Ref } from 'vue'
import { Position, type Node, type Edge } from '@vue-flow/core'
import * as dagre from 'dagre'
import type { Overview } from '~/types/esos'
import type { FCPort } from '~/server/utils/types'

// ─── Types internes ────────────────────────────────────────────────────────────

export interface TopologyGraph {
  nodes: Node[]
  edges: Edge[]
}

// ─── Construction pure (testable sans Vue) ──────────────────────────────────────

export function buildTopologyGraph(
  overview: Overview,
  fcPorts: FCPort[],
): TopologyGraph {
  const newNodes: Node[] = []
  const newEdges: Edge[] = []

  const activeInitiators = new Set(overview.sessions.map((s) => s.initiatorName))

  // ── Nœuds HBA Ports ────────────────────────────────────────────────────────
  for (const port of fcPorts) {
    newNodes.push({
      id:       `hba-${port.host}`,
      type:     'hba-port',
      data:     { port },
      position: { x: 0, y: 0 },
    })
  }

  // ── Nœuds Targets + edges HBA → Target ─────────────────────────────────────
  const deviceIds = new Set<string>()

  for (const target of overview.targets) {
    newNodes.push({
      id:       `target-${target.name}`,
      type:     'fc-target',
      data:     { target, sessionCount: target.sessions.length },
      position: { x: 0, y: 0 },
    })

    // Lier le port FC via rel_tgt_id (1-indexé)
    const relTgtId  = parseInt(target.attrs?.rel_tgt_id ?? '1', 10)
    const matchPort = fcPorts.find((_, i) => i + 1 === relTgtId)
    if (matchPort) {
      newEdges.push({
        id:     `e-hba-${matchPort.host}-to-${target.name}`,
        source: `hba-${matchPort.host}`,
        target: `target-${target.name}`,
        type:   'smoothstep',
        style:  { stroke: '#6b7280', strokeWidth: 2 },
      })
    }

    // ── Groups ──────────────────────────────────────────────────────────────
    for (const group of target.groups) {
      const groupId = `group-${target.name}-${group.name}`

      newNodes.push({
        id:       groupId,
        type:     'scst-group',
        data:     { group, target: target.name },
        position: { x: 0, y: 0 },
      })

      newEdges.push({
        id:     `e-${target.name}-to-${groupId}`,
        source: `target-${target.name}`,
        target: groupId,
        type:   'smoothstep',
        style:  { stroke: '#3b82f6', strokeWidth: 1.5 },
      })

      // ── Initiateurs ───────────────────────────────────────────────────────
      for (const initiator of group.initiators) {
        const initId   = `initiator-${initiator}`
        const isActive = activeInitiators.has(initiator)

        // Éviter les doublons si initiateur dans plusieurs groupes
        if (!newNodes.find((n) => n.id === initId)) {
          newNodes.push({
            id:       initId,
            type:     'fc-initiator',
            data:     { wwn: initiator, active: isActive },
            position: { x: 0, y: 0 },
          })
        }

        newEdges.push({
          id:       `e-${initiator}-to-${groupId}`,
          source:   initId,
          target:   groupId,
          type:     isActive ? 'smoothstep' : 'straight',
          animated: isActive,
          style:    {
            stroke:          isActive ? '#f97316' : '#d1d5db',
            strokeWidth:     isActive ? 2 : 1,
            strokeDasharray: isActive ? undefined : '4 4',
          },
          labelStyle: { fontSize: '10px', fill: '#6b7280' },
        })
      }

      // ── LUNs → Device ─────────────────────────────────────────────────────
      for (const lun of group.luns) {
        const deviceId = `device-${lun.device}`
        deviceIds.add(lun.device)

        newEdges.push({
          id:         `e-${groupId}-lun${lun.id}-${lun.device}`,
          source:     groupId,
          target:     deviceId,
          label:      `LUN ${lun.id}`,
          type:       'smoothstep',
          style:      { stroke: '#10b981', strokeWidth: 1.5 },
          labelStyle: { fontSize: '9px', fill: '#059669', fontWeight: '600' },
        })
      }
    }
  }

  // ── Nœuds Devices ─────────────────────────────────────────────────────────
  for (const device of overview.devices) {
    if (!deviceIds.has(device.name)) continue
    newNodes.push({
      id:       `device-${device.name}`,
      type:     'scst-device',
      data:     { device },
      position: { x: 0, y: 0 },
    })
  }

  // ── Layout dagre ──────────────────────────────────────────────────────────
  applyDagreLayout(newNodes, newEdges)

  return { nodes: newNodes, edges: newEdges }
}

// ─── Layout automatique (exporté pour tests T05) ────────────────────────────────

export function applyDagreLayout(nodes: Node[], edges: Edge[]): void {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120, marginx: 40, marginy: 40 })

  const NODE_SIZES: Record<string, { w: number; h: number }> = {
    'hba-port':     { w: 140, h: 70 },
    'fc-target':    { w: 180, h: 80 },
    'scst-group':   { w: 150, h: 90 },
    'fc-initiator': { w: 160, h: 60 },
    'scst-device':  { w: 140, h: 80 },
  }

  for (const node of nodes) {
    const size = NODE_SIZES[node.type ?? ''] ?? { w: 150, h: 60 }
    g.setNode(node.id, { width: size.w, height: size.h })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  for (const node of nodes) {
    const pos = g.node(node.id) as dagre.GraphLabel & { x: number; y: number; width: number; height: number }
    if (pos) {
      node.position       = { x: pos.x - pos.width / 2, y: pos.y - pos.height / 2 }
      node.sourcePosition = Position.Right
      node.targetPosition = Position.Left
    }
  }
}

// ─── Composable réactif ─────────────────────────────────────────────────────────

export function useTopologyGraph(
  overview: Ref<Overview | null>,
  fcPorts:  Ref<FCPort[]>,
) {
  const nodes = ref<Node[]>([])
  const edges = ref<Edge[]>([])

  watchEffect(() => {
    if (!overview.value) {
      nodes.value = []
      edges.value = []
      return
    }
    const graph  = buildTopologyGraph(overview.value, fcPorts.value)
    nodes.value  = graph.nodes
    edges.value  = graph.edges
  })

  return { nodes, edges }
}
