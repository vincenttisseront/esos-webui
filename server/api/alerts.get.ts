import { defineEventHandler } from 'h3'
import { readHardwareOverview } from '../utils/hardware-reader'
import { readOverview } from '../utils/scst-config-reader'
import { detectAlerts } from '../utils/alerts'
import { hasConfiguredSSH } from '../utils/ssh-runtime'
import { runReadWithSanScope, resolveScopedSanIdForRead, defaultStatsBucketSanId } from '../utils/san-request-context'
import { createEmptyHardwareOverview } from '../utils/types'
import { createEmptyOverview } from '../../types/esos'
import { getAllSettings } from '../db/repositories/settings.repository'
import { parseAlertSettingsFromMap } from '../utils/alert-settings'

export default defineEventHandler(async (event) => {
  if (!hasConfiguredSSH()) {
    return []
  }

  try {
    const allSettings = await getAllSettings()
    const settings    = parseAlertSettingsFromMap(allSettings)

    const run = () => Promise.all([readHardwareOverview(), readOverview()])
    const [hw, overview] = await runReadWithSanScope(event, run)

    const sanKey = resolveScopedSanIdForRead(event) ?? defaultStatsBucketSanId()

    return detectAlerts(hw ?? createEmptyHardwareOverview(), overview ?? createEmptyOverview(), {
      settings,
      sanKey,
    })
  } catch (err: unknown) {
    const code = (err as { statusCode?: number }).statusCode
    if (code === 400) throw err
    return []
  }
})
