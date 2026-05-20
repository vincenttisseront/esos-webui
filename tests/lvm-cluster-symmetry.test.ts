import { describe, expect, it } from 'vitest'
import {
  findCrossNodeLvNameMismatch,
  findCrossNodeVgNameMismatch,
  findLvmStructuralIssues,
} from '../utils/lvm-cluster-symmetry'

describe('findLvmStructuralIssues', () => {
  it('warns when VG missing on peer', () => {
    const issues = findLvmStructuralIssues(
      { vgs: [{ name: 'vg0', uuid: 'a', sizeBytes: 1, freeBytes: 1, pvCount: 1, lvCount: 0, clustered: false }], pvs: [] },
      [{ nodeSanId: 'b', nodeLabel: 'esos2', pvs: [], vgs: [], lvs: [] }],
    )
    expect(issues.some(i => i.vgName === 'vg0' && i.message.includes('absent'))).toBe(true)
  })

  it('does not flag different VG UUID as error', () => {
    const issues = findLvmStructuralIssues(
      { vgs: [{ name: 'data', uuid: 'local-uuid', sizeBytes: 1e12, freeBytes: 5e11, pvCount: 1, lvCount: 0, clustered: false }], pvs: [] },
      [{ nodeSanId: 'b', nodeLabel: 'esos2', pvs: [], vgs: [{ name: 'data', uuid: 'peer-uuid', sizeBytes: 1e12, freeBytes: 5e11, pvCount: 1, lvCount: 0, clustered: false }], lvs: [] }],
    )
    expect(issues.some(i => i.message.includes('UUID'))).toBe(false)
  })

  it('critical on clustered VG', () => {
    const issues = findLvmStructuralIssues(
      { vgs: [{ name: 'vg0', uuid: 'a', sizeBytes: 1, freeBytes: 1, pvCount: 1, lvCount: 0, clustered: true }], pvs: [] },
      [],
    )
    expect(issues.some(i => i.severity === 'critical')).toBe(true)
  })

  it('findCrossNodeVgNameMismatch detects different VG sets', () => {
    const issues = findCrossNodeVgNameMismatch([
      { nodeLabel: 'esos1', vgs: [{ name: 'data', uuid: 'a', sizeBytes: 1, freeBytes: 1, pvCount: 1, lvCount: 0, clustered: false }] },
      { nodeLabel: 'esos2', vgs: [{ name: 'vg0', uuid: 'b', sizeBytes: 1, freeBytes: 1, pvCount: 1, lvCount: 0, clustered: false }] },
    ])
    expect(issues.length).toBeGreaterThan(0)
  })

  it('findCrossNodeLvNameMismatch detects missing LV on peer', () => {
    const issues = findCrossNodeLvNameMismatch([
      { nodeLabel: 'esos1', lvs: [{ name: 'lv0', path: '/dev/data/lv0', vgName: 'data', sizeBytes: 1, uuid: 'u', active: true, usedBy: [] }] },
      { nodeLabel: 'esos2', lvs: [] },
    ], 'data')
    expect(issues.some(i => i.message.includes('esos2'))).toBe(true)
  })
})
