import { describe, it, expect } from 'vitest'
import {
  validateGroupName,
  validateInitiatorValue,
  initiatorAlreadyOnTarget,
  expectedDeleteGroupConfirmation,
} from '../utils/scst-initiator-validation'

describe('validateGroupName', () => {
  it('accepts valid names', () => {
    expect(validateGroupName('hosts_fc').ok).toBe(true)
  })

  it('rejects empty and invalid chars', () => {
    expect(validateGroupName('').ok).toBe(false)
    expect(validateGroupName('bad name').ok).toBe(false)
  })
})

describe('validateInitiatorValue', () => {
  it('accepts 8-byte WWPN', () => {
    const r = validateInitiatorValue('10:00:00:00:c9:99:03:c3', { type: 'fc' })
    expect(r.ok).toBe(true)
    expect(r.normalized).toBe('10:00:00:00:c9:99:03:c3')
  })

  it('accepts IQN', () => {
    const r = validateInitiatorValue('iqn.1994-05.com.redhat:client', { type: 'iscsi' })
    expect(r.ok).toBe(true)
  })

  it('accepts pattern initiators', () => {
    const r = validateInitiatorValue('iqn.1994-05.com.redhat:*', { type: 'pattern' })
    expect(r.ok).toBe(true)
  })

  it('rejects duplicate across groups', () => {
    const groups = [
      { name: 'g1', initiators: ['10:00:00:00:c9:99:03:c3'] },
      { name: 'g2', initiators: [] },
    ]
    expect(initiatorAlreadyOnTarget(groups, '10:00:00:00:c9:99:03:c3')).toBe(true)
    expect(initiatorAlreadyOnTarget(groups, '10:00:00:00:c9:99:03:c3', 'g1')).toBe(false)
  })
})

describe('expectedDeleteGroupConfirmation', () => {
  it('builds phrase', () => {
    expect(expectedDeleteGroupConfirmation('tgt', 'grp')).toBe('DELETE GROUP tgt/grp')
  })
})
