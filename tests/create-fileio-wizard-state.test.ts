import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const wizardSource = readFileSync(
  resolve(process.cwd(), 'components/fs/CreateFileioWizard.vue'),
  'utf8',
)

describe('CreateFileioWizard empty-state template', () => {
  it('shows form only when eligible vdisks exist', () => {
    expect(wizardSource).toContain('v-if="step === 1 && !hasEligibleVdisks"')
    expect(wizardSource).toContain('v-else-if="step === 1"')
    expect(wizardSource).toContain('hasEligibleVdisks')
  })

  it('does not show name validation in empty state block', () => {
    const emptyBlock = wizardSource.slice(
      wizardSource.indexOf('v-if="step === 1 && !hasEligibleVdisks"'),
      wizardSource.indexOf('v-else-if="step === 1"'),
    )
    expect(emptyBlock).not.toContain('nameError')
    expect(emptyBlock).not.toContain('USelect')
    expect(emptyBlock).not.toContain('nv_cache')
  })

  it('hides wizard next and create when no eligible vdisks', () => {
    expect(wizardSource).toContain('v-if="!hasEligibleVdisks"')
    expect(wizardSource).toContain('v-else-if="step >= 3 && !registerBlocked"')
    expect(wizardSource).toContain('showNameError')
  })
})
