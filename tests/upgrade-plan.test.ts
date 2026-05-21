import { describe, it, expect } from 'vitest'
import { buildStandaloneUpgradeSteps } from '../server/utils/upgrade-plan'

describe('buildStandaloneUpgradeSteps', () => {
  it('orders conf_sync before install and reboot', () => {
    const steps = buildStandaloneUpgradeSteps('abc', '/tmp/pkg.zip', '/tmp/staging-abc')
    const kinds = steps.map(s => s.kind)
    const confIdx = kinds.indexOf('conf_sync')
    const installIdx = kinds.indexOf('install')
    const rebootIdx = kinds.indexOf('reboot')
    expect(confIdx).toBeGreaterThanOrEqual(0)
    expect(installIdx).toBeGreaterThan(confIdx)
    expect(rebootIdx).toBeGreaterThan(installIdx)
  })

  it('marks conf_sync and reboot as manual', () => {
    const steps = buildStandaloneUpgradeSteps()
    expect(steps.find(s => s.kind === 'conf_sync')?.manual).toBe(true)
    expect(steps.find(s => s.kind === 'reboot')?.manual).toBe(true)
    expect(steps.find(s => s.kind === 'install')?.manual).toBe(true)
  })
})
