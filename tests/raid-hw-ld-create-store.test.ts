import { describe, expect, it, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useRaidStore } from '../stores/raid'

const fetchMock = vi.fn()

vi.stubGlobal('$fetch', fetchMock)

describe('raid store createHardwareLogicalDrive', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
  })

  it('refreshes overview after successful hardware LD create', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        warning: false,
        command: 'perccli64 /c0 add vd type=raid1 drives=252:2,252:3 wt nora',
        exitCode: 0,
        stdout: 'OK',
        stderr: '',
        controllerId: '0',
        requestedRaidLevel: '1',
        selectedSlots: ['252:2', '252:3'],
        overviewRefreshed: true,
      })
      .mockResolvedValueOnce({ hardwareControllers: [], mdArrays: [], blockDevices: [] })

    const store = useRaidStore()
    store.sanId = 'san-1'

    await store.createHardwareLogicalDrive({
      controllerId: '0',
      raidLevel: '1',
      drives: [{ enclosure: '252', slot: '2' }, { enclosure: '252', slot: '3' }],
      sizeMode: 'max',
      readPolicy: 'NORA',
      writePolicy: 'WT',
      confirmation: 'CREATE LD 1',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/raid/hardware/logical-drives')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/raid/overview')
    expect(fetchMock.mock.calls[1][1]?.params?.refresh).toBe('1')
  })
})
