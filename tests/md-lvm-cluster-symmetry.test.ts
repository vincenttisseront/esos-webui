import { describe, expect, it } from 'vitest'
import {
  assessMdLvmClusterSymmetry,
  collectMdArrayLvmStates,
  filterMdClusterAsymmetryHardBlockers,
  vgNamesOnMdPath,
} from '../utils/md-lvm-cluster-symmetry'

describe('md-lvm-cluster-symmetry', () => {
  it('vgNamesOnMdPath maps PV on /dev/md0', () => {
    expect(vgNamesOnMdPath(
      [{ path: '/dev/md0', vgName: 'data' }, { path: '/dev/sdb', vgName: '' }],
      '/dev/md0',
    )).toEqual(['data'])
  })

  it('does not flag asymmetry when both nodes have same VG on md0', () => {
    const states = collectMdArrayLvmStates([
      {
        sanId: 'n1',
        label: 'esos1',
        mdArrays: [{ name: 'md0', path: '/dev/md0', usedBy: ['lvm'] }],
        pvs: [{ path: '/dev/md0', vgName: 'data' }],
      },
      {
        sanId: 'n2',
        label: 'esos2',
        mdArrays: [{ name: 'md0', path: '/dev/md0', usedBy: ['lvm'] }],
        pvs: [{ path: '/dev/md0', vgName: 'data' }],
      },
    ], 'md0')
    expect(assessMdLvmClusterSymmetry(states)).toHaveLength(0)
    expect(filterMdClusterAsymmetryHardBlockers(
      ['esos1 : /dev/md0 est utilisé par LVM', 'esos2 : /dev/md0 est utilisé par LVM'],
      [],
    )).toEqual([])
  })

  it('flags critical when LVM on one node only', () => {
    const states = collectMdArrayLvmStates([
      {
        sanId: 'n1',
        label: 'esos1',
        mdArrays: [{ name: 'md0', path: '/dev/md0', usedBy: ['lvm'] }],
        pvs: [{ path: '/dev/md0', vgName: 'data' }],
      },
      {
        sanId: 'n2',
        label: 'esos2',
        mdArrays: [{ name: 'md0', path: '/dev/md0', usedBy: [] }],
        pvs: [],
      },
    ], 'md0')
    const issues = assessMdLvmClusterSymmetry(states)
    expect(issues.some(i => i.severity === 'critical')).toBe(true)
    expect(filterMdClusterAsymmetryHardBlockers(
      ['esos1 : /dev/md0 est utilisé par LVM'],
      issues,
    )).toEqual(['esos1 : /dev/md0 est utilisé par LVM'])
  })

  it('warns when VG names differ on same md path', () => {
    const states = collectMdArrayLvmStates([
      {
        sanId: 'n1',
        label: 'esos1',
        mdArrays: [{ name: 'md0', path: '/dev/md0', usedBy: ['lvm'] }],
        pvs: [{ path: '/dev/md0', vgName: 'data' }],
      },
      {
        sanId: 'n2',
        label: 'esos2',
        mdArrays: [{ name: 'md0', path: '/dev/md0', usedBy: ['lvm'] }],
        pvs: [{ path: '/dev/md0', vgName: 'vg0' }],
      },
    ], 'md0')
    expect(assessMdLvmClusterSymmetry(states).some(i => i.message.includes('VG différents'))).toBe(true)
  })
})
