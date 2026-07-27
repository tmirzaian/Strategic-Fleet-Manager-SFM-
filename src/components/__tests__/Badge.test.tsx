import { describe, it, expect } from 'vitest'
import { procurementRowStateTone, procurementRowStateLabel } from '../Badge'

describe('procurementRowStateTone (UX-001B.3 Deliverable 1/2: Canonical Procurement State Colors)', () => {
  it('Available is success (green) — ready for immediate installation', () => {
    expect(procurementRowStateTone('AVAILABLE')).toBe('success')
  })

  it('Reserved is cyan (Quartermaster Blue) — owned but committed elsewhere, not immediately deployable', () => {
    expect(procurementRowStateTone('RESERVED')).toBe('cyan')
  })

  it('Reserved is never success — it must not read identically to Available', () => {
    expect(procurementRowStateTone('RESERVED')).not.toBe('success')
  })

  it('Purchase Required is muted (white/gray) — not owned, external procurement required', () => {
    expect(procurementRowStateTone('PURCHASE_REQUIRED')).toBe('muted')
  })
})

describe('procurementRowStateLabel', () => {
  it('maps each state to its Commander-facing label', () => {
    expect(procurementRowStateLabel('RESERVED')).toBe('Reserved')
    expect(procurementRowStateLabel('AVAILABLE')).toBe('Available')
    expect(procurementRowStateLabel('PURCHASE_REQUIRED')).toBe('Purchase Required')
  })
})
