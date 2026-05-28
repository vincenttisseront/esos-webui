import { describe, expect, it } from 'vitest'
import {
  buildRescanOutcome,
  buildRescanPlan,
  megaraidHostsFromProcNames,
  resolveRescanHost,
} from '../utils/hw-raid-rescan'

describe('resolveRescanHost', () => {
  it('prefers explicit host request', () => {
    expect(resolveRescanHost({ requestedHost: '3', scsiAddress: '1:0:0:0' })).toBe('3')
  })

  it('falls back to host from scsi address', () => {
    expect(resolveRescanHost({ requestedHost: '', scsiAddress: '1:2:0:0' })).toBe('1')
  })

  it('returns null when host cannot be determined', () => {
    expect(resolveRescanHost({ requestedHost: 'abc', scsiAddress: '' })).toBeNull()
  })

  it('identifies megaraid_sas hosts from proc_name snapshot', () => {
    const hosts = megaraidHostsFromProcNames('host0 megaraid_sas\nhost1 ahci\nhost2 megaraid_sas')
    expect(hosts).toEqual(['0', '2'])
  })

  it('builds rescan steps in expected order', () => {
    const plan = buildRescanPlan({ preferredHost: '2', megaraidHosts: ['2'] })
    expect(plan.map(p => p.key)).toEqual([
      'targeted_hosts',
      'all_hosts',
      'scsi_device_rescan',
      'udev_settle',
    ])
  })

  it('marks outcome as found when mapped path appears', () => {
    expect(buildRescanOutcome('/dev/sdb')).toMatchObject({
      foundNewDevice: true,
      suggestReboot: false,
    })
  })

  it('marks outcome as reboot suggestion when still missing', () => {
    expect(buildRescanOutcome(null)).toMatchObject({
      foundNewDevice: false,
      suggestReboot: true,
    })
  })
})
