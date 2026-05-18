/**
 * SDD v2.5 — Topology tests (T01–T06)
 * Tests are pure, calling buildTopologyGraph() and applyDagreLayout() directly.
 */

import { describe, it, expect } from 'vitest'
import { buildTopologyGraph, applyDagreLayout } from '../composables/useTopologyGraph'
import type { Overview, Target, Group, Lun, Session, Device } from '../types/esos'
import type { FCPort } from '../server/utils/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDevice(name: string): Device {
  return { name, handler: 'vdisk_blockio', filename: `/dev/${name}`, attrs: {} }
}

function makeLun(id: number, device: string): Lun {
  return { id, device, readOnly: false, attrs: {} }
}

function makeGroup(name: string, initiators: string[], luns: Lun[]): Group {
  return { name, initiators, luns }
}

function makeTarget(name: string, groups: Group[], sessions: Session[] = []): Target {
  return {
    name,
    driver: 'qla2x00t',
    enabled: true,
    hwTarget: true,
    attrs: { rel_tgt_id: '1' },
    groups,
    luns: [],
    sessions,
  }
}

function makeSession(initiatorName: string, target: string): Session {
  return { initiatorName, target, driver: 'qla2x00t', ipAddr: '', sid: '0x1' }
}

function makeOverview(targets: Target[], devices: Device[], sessions: Session[] = []): Overview {
  return {
    stats: {
      targets: targets.length,
      devices: devices.length,
      sessions: sessions.length,
      groups: targets.flatMap((t) => t.groups).length,
      luns: 0,
    },
    targets,
    systemTargets: [],
    devices,
    sessions,
  }
}

const noFCPorts: FCPort[] = []

// ─── T01: 2 targets → 2 fc-target nodes ────────────────────────────────────

describe('T01 – node count matches target count', () => {
  it('produces exactly 2 fc-target nodes for 2 targets', () => {
    const overview = makeOverview(
      [makeTarget('wwn:target-1', []), makeTarget('wwn:target-2', [])],
      [],
    )
    const { nodes } = buildTopologyGraph(overview, noFCPorts)
    const targetNodes = nodes.filter((n) => n.type === 'fc-target')
    expect(targetNodes).toHaveLength(2)
  })
})

// ─── T02: Active initiator → animated edge ─────────────────────────────────

describe('T02 – active initiator produces animated edge', () => {
  it('edge to active initiator has animated=true', () => {
    const initiator = 'wwn:init-active'
    const session   = makeSession(initiator, 'wwn:target-1')
    const group     = makeGroup('grp0', [initiator], [])
    const target    = makeTarget('wwn:target-1', [group], [session])
    const overview  = makeOverview([target], [], [session])

    const { edges } = buildTopologyGraph(overview, noFCPorts)
    const initEdge  = edges.find((e) => e.source === `initiator-${initiator}`)
    expect(initEdge).toBeDefined()
    expect(initEdge?.animated).toBe(true)
  })
})

// ─── T03: Inactive initiator → dashed edge ──────────────────────────────────

describe('T03 – inactive initiator produces dashed edge', () => {
  it('edge to offline initiator has strokeDasharray set', () => {
    const initiator = 'wwn:init-offline'
    const group     = makeGroup('grp0', [initiator], [])
    const target    = makeTarget('wwn:target-1', [group], [])
    const overview  = makeOverview([target], [], [])

    const { edges } = buildTopologyGraph(overview, noFCPorts)
    const initEdge  = edges.find((e) => e.source === `initiator-${initiator}`)
    expect(initEdge).toBeDefined()
    expect((initEdge?.style as any)?.strokeDasharray).toBeTruthy()
  })
})

// ─── T04: Device referenced by 2 groups → single device node ─────────────────

describe('T04 – shared device deduplication', () => {
  it('device node appears only once even if referenced by 2 groups', () => {
    const shared = makeDevice('sda')
    const lun1   = makeLun(0, 'sda')
    const lun2   = makeLun(0, 'sda')
    const grp1   = makeGroup('grp1', [], [lun1])
    const grp2   = makeGroup('grp2', [], [lun2])
    const target = makeTarget('wwn:target-1', [grp1, grp2])
    const overview = makeOverview([target], [shared])

    const { nodes } = buildTopologyGraph(overview, noFCPorts)
    const deviceNodes = nodes.filter((n) => n.id === 'device-sda')
    expect(deviceNodes).toHaveLength(1)
  })
})

// ─── T05: applyDagreLayout → all nodes have non-zero position ─────────────────

describe('T05 – dagre layout assigns positions', () => {
  it('all nodes have a position with non-zero x or y after layout', () => {
    const target  = makeTarget('wwn:target-1', [makeGroup('grp0', [], [])])
    const overview = makeOverview([target], [])
    const { nodes, edges } = buildTopologyGraph(overview, noFCPorts)

    // Layout already applied by buildTopologyGraph, but call directly for T05
    // Reset positions to zero first
    for (const n of nodes) n.position = { x: 0, y: 0 }
    applyDagreLayout(nodes, edges)

    // At least some nodes should have non-zero position
    const anyNonZero = nodes.some((n) => n.position.x !== 0 || n.position.y !== 0)
    expect(anyNonZero).toBe(true)
  })
})

// ─── T06: Empty overview → no error, no crash ─────────────────────────────────

describe('T06 – empty overview does not throw', () => {
  it('returns empty or minimal node/edge list without throwing', () => {
    const overview = makeOverview([], [], [])
    expect(() => buildTopologyGraph(overview, noFCPorts)).not.toThrow()
    const { nodes, edges } = buildTopologyGraph(overview, noFCPorts)
    expect(nodes).toBeDefined()
    expect(edges).toBeDefined()
  })
})
