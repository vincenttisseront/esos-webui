import { describe, expect, it } from 'vitest'
import { classifyHwRaidRescanState } from '../utils/hw-raid-rescan-ui'

describe('hw-raid-rescan-ui', () => {
  it('returns success_mapped when mapped path is found', () => {
    const state = classifyHwRaidRescanState(
      [{ controllerId: '0', controllerLabel: 'PERC', vdId: '0/vd1', sizeBytes: 1, status: { controllerDetected: true, osDeviceDetected: false, pendingRescan: true }, reasons: [] }],
      { foundNewDevice: true, mappedPath: '/dev/sdb' },
    )
    expect(state).toBe('success_mapped')
  })

  it('returns success_no_device when pending remains after rescan', () => {
    const state = classifyHwRaidRescanState(
      [{ controllerId: '0', controllerLabel: 'PERC', vdId: '0/vd1', sizeBytes: 1, status: { controllerDetected: true, osDeviceDetected: false, pendingRescan: true }, reasons: [] }],
      { foundNewDevice: false, mappedPath: null },
    )
    expect(state).toBe('success_no_device')
  })
})
