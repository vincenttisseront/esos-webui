import { describe, expect, it } from 'vitest'
import { bindScstBlocker, parseBindScstBlocker } from '../utils/lvm-bind-scst-blockers'
import {
  formatBindScstPreflightBlockers,
  resolveBindScstExecuteError,
  resolveBindScstBlockerMessage,
} from '../utils/lvm-bind-scst-ui'

describe('lvm-bind-scst blockers', () => {
  it('round-trips device_exists blocker', () => {
    const line = bindScstBlocker('device_exists', 'lv_data_photos', 'esos1')
    expect(parseBindScstBlocker(line)).toEqual({
      kind: 'device_exists',
      deviceName: 'lv_data_photos',
      nodeLabel: 'esos1',
    })
  })
})

describe('lvm-bind-scst-ui messages', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    `${key}:${JSON.stringify(params ?? {})}`

  it('formats device_exists blocker for i18n', () => {
    const msg = resolveBindScstBlockerMessage(
      bindScstBlocker('device_exists', 'lv_data_photos', 'esos1'),
      t,
    )
    expect(msg).toContain('error_device_exists_on_node')
    expect(msg).toContain('lv_data_photos')
  })

  it('maps 409 conflict with hint', () => {
    const msg = resolveBindScstExecuteError(
      { statusCode: 409, data: { code: 'lvm.scst_device_conflict' } },
      t,
    )
    expect(msg).toContain('error_conflict')
    expect(msg).toContain('error_conflict_hint')
  })

  it('joins multiple preflight blockers', () => {
    const text = formatBindScstPreflightBlockers(
      [bindScstBlocker('lv_path_missing', '/dev/data/photos', 'esos2')],
      t,
    )
    expect(text).toContain('error_lv_path_missing')
  })
})
