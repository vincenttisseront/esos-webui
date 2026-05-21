import { describe, it, expect } from 'vitest'
import {
  formFieldStackClass,
  formFieldClass,
  appTextInputUi,
} from '../utils/form-field-styles'

describe('form-field-styles', () => {
  it('stack uses gap-5 for field separation', () => {
    expect(formFieldStackClass).toContain('gap-5')
  })

  it('field wrapper separates label from control', () => {
    expect(formFieldClass).toContain('gap-1.5')
  })

  it('input ui uses h-11 and rounded-xl', () => {
    expect(appTextInputUi.base).toContain('h-11')
    expect(appTextInputUi.base).toContain('rounded-xl')
  })
})
