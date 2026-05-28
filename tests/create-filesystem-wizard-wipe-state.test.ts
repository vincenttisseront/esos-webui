import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const wizardSource = readFileSync(
  resolve(process.cwd(), 'components/fs/CreateFilesystemWizard.vue'),
  'utf8',
)

describe('CreateFilesystemWizard wipe-required backend UX', () => {
  it('shows backend status badge states', () => {
    expect(wizardSource).toContain("storage.fs.wizard.create_fs.status.${selectedBackendStatus}")
    expect(wizardSource).toContain('selectedBackendStatus')
  })

  it('shows wipe warning and explicit confirmation checkbox', () => {
    expect(wizardSource).toContain("selectedBackendStatus === 'wipe_required'")
    expect(wizardSource).toContain("t('storage.fs.wizard.create_fs.wipe_warning')")
    expect(wizardSource).toContain("t('storage.fs.wizard.create_fs.confirm_wipe')")
    expect(wizardSource).toContain('allowWipeSignatures')
  })
})
