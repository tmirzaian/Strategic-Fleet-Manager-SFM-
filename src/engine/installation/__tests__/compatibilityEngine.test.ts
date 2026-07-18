import { describe, it, expect } from 'vitest'
import { checkInstallationCompatibility } from '../compatibilityEngine'
import { resolveComponentIdentity } from '../componentIdentityService'

describe('EWO-STAB-003B: CompatibilityEngine', () => {
  describe('catalog mode (default) — the Veil scenario, EWO-STAB-002 parity', () => {
    it('1. a real Shield (FR-66) is rejected for a Power Plant slot', () => {
      const identity = resolveComponentIdentity({ displayName: 'FR-66' })!
      const result = checkInstallationCompatibility(identity, { type: 'Power Plant', size: 'S1' })
      expect(result.compatible).toBe(false)
      expect(result.message).toBeDefined()
    })

    it('2. a real Power Plant (Slipstream) is accepted for a Power Plant slot of the same size', () => {
      const identity = resolveComponentIdentity({ displayName: 'Slipstream' })!
      const result = checkInstallationCompatibility(identity, { type: 'Power Plant', size: 'S1' })
      expect(result.compatible).toBe(true)
    })

    it('3. an uncataloged component is permitted — never disprove compatibility we have no data for (EWO-024, unchanged)', () => {
      const identity = resolveComponentIdentity({ displayName: 'Some Unknown Component' })!
      const result = checkInstallationCompatibility(identity, { type: 'Power Plant', size: 'S1' })
      expect(result.compatible).toBe(true)
    })
  })

  describe("exact-slot-match mode — moveComponentBetweenShips' own pre-existing, unchanged rule", () => {
    it('4. a destination matching the reference slot exactly is compatible', () => {
      const identity = resolveComponentIdentity({ displayName: 'FR-66' })!
      const result = checkInstallationCompatibility(identity, { type: 'Shield', size: 'S1' }, { mode: 'exact-slot-match', referenceSlot: { type: 'Shield', size: 'S1' } })
      expect(result.compatible).toBe(true)
    })

    it('5. same category, different size is rejected — exact-slot-match never falls back to the catalog rule', () => {
      const identity = resolveComponentIdentity({ displayName: 'FR-66' })!
      const result = checkInstallationCompatibility(identity, { type: 'Shield', size: 'S2' }, { mode: 'exact-slot-match', referenceSlot: { type: 'Shield', size: 'S1' } })
      expect(result.compatible).toBe(false)
    })

    it('6. exact-slot-match ignores the catalog entirely — an uncataloged component still only matches by raw type/size equality', () => {
      const identity = resolveComponentIdentity({ displayName: 'Some Unknown Component' })!
      const result = checkInstallationCompatibility(identity, { type: 'Power Plant', size: 'S1' }, { mode: 'exact-slot-match', referenceSlot: { type: 'Shield', size: 'S1' } })
      expect(result.compatible).toBe(false)
    })
  })
})
