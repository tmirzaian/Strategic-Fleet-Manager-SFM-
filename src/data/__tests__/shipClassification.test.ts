import { describe, it, expect } from 'vitest'
import { classificationFor, ALL_RSI_ROLES } from '../shipClassification'
import { shipDefinitions } from '../shipDefinitions'

describe('shipClassification (Golden Scenario B)', () => {
  it('7. the Industrial filter set includes MOLE, Vulture, and Prospector via normalized roles', () => {
    expect(classificationFor('mole').rsiRoles).toContain('Industrial')
    expect(classificationFor('vulture').rsiRoles).toContain('Industrial')
    expect(classificationFor('prospector').rsiRoles).toContain('Industrial')
  })

  it('8. a ship with multiple RSI roles can appear in more than one filter', () => {
    const m80 = classificationFor('m80')
    expect(m80.rsiRoles.length).toBeGreaterThan(1)
    expect(m80.rsiRoles).toContain('Competition')
    expect(m80.rsiRoles).toContain('Combat')
  })

  it('an unclassified ship id returns an explicit UNKNOWN classification rather than guessing', () => {
    const unknown = classificationFor('some-ship-with-no-mapping')
    expect(unknown.rsiRoles).toEqual([])
    expect(unknown.source).toBe('UNKNOWN')
  })

  it('every seed and imported ShipDefinition carries a classification object, never a bare Build-name-derived string', () => {
    for (const def of shipDefinitions) {
      expect(def.classification).toBeDefined()
      expect(Array.isArray(def.classification.rsiRoles)).toBe(true)
    }
  })

  it('the normalized taxonomy matches the required minimum role set', () => {
    for (const role of ['Combat', 'Transport', 'Exploration', 'Industrial', 'Support', 'Ground', 'Multi-role']) {
      expect(ALL_RSI_ROLES).toContain(role)
    }
  })
})
