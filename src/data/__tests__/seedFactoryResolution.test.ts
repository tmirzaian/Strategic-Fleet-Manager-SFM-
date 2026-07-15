import { describe, it, expect } from 'vitest'
import { hardpoints, ships } from '../seed'
import { shipFactoryTemplates } from '../shipDefinitions'

/**
 * EWO-031 (Task 6/7) — Canonical Factory Template Audit. Root cause of the
 * reported Origin 135c bug: 135c and UTV were the only two seed ships whose
 * hardpoints came from `defaultBuildHardpoints()` with zero component
 * overrides, so every one of their 11 slots fell through to the
 * 'Unknown Factory Item' placeholder for Factory AND Installed — Target
 * alone resolved once a custom Loadout existed, since Target is fed
 * independently through Loadout Manager/Quartermaster template selections,
 * not from the same seed row. Fixed with real, already-proven-compatible
 * component overrides (src/data/seed.ts), the same pattern EWO-023 already
 * used to fix Cutlass Red. Starlite is a deliberate, documented exception —
 * its "Unknown / Future" placeholder is intentional, not a gap.
 */
describe('EWO-031 (Task 6): Origin 135c and UTV factory resolution', () => {
  it('1. no 135c hardpoint shows Unknown Factory Item for Factory or Installed', () => {
    const rows = hardpoints.filter((h) => h.shipId === '135c')
    expect(rows.length).toBeGreaterThan(0)
    for (const h of rows) {
      expect(h.factoryItem).not.toBe('Unknown Factory Item')
      expect(h.installedItem).not.toBe('Unknown Factory Item')
    }
  })

  it('2. no UTV hardpoint shows Unknown Factory Item for Factory or Installed', () => {
    const rows = hardpoints.filter((h) => h.shipId === 'utv')
    expect(rows.length).toBeGreaterThan(0)
    for (const h of rows) {
      expect(h.factoryItem).not.toBe('Unknown Factory Item')
      expect(h.installedItem).not.toBe('Unknown Factory Item')
    }
  })

  it('3. every 135c and UTV hardpoint resolves to status OK — no Unresolved, no Invalid Target', () => {
    for (const shipId of ['135c', 'utv']) {
      const rows = hardpoints.filter((h) => h.shipId === shipId)
      for (const h of rows) {
        expect(h.status).toBe('OK')
      }
    }
  })

  it('4. 135c and UTV Target values resolve to something real (not the pre-fix asymmetry where only Target was valid)', () => {
    for (const shipId of ['135c', 'utv']) {
      const rows = hardpoints.filter((h) => h.shipId === shipId && h.targetItem !== '—')
      expect(rows.length).toBeGreaterThan(0)
      for (const h of rows) {
        expect(h.targetItem).not.toBe('Unknown Factory Item')
        expect(h.factoryItem).toBe(h.targetItem) // factory-fresh, nothing customized yet
      }
    }
  })

  it("5. shipFactoryTemplates['135c'] and ['utv'] carry real factoryItem values, not the placeholder", () => {
    for (const id of ['135c', 'utv']) {
      const template = shipFactoryTemplates[id]
      expect(template).toBeDefined()
      expect(template.length).toBeGreaterThan(0)
      for (const row of template) {
        expect(row.factoryItem).not.toBe('Unknown Factory Item')
      }
    }
  })
})

describe('EWO-031 (Task 7): fleet-wide import validation — no undocumented Unknown Factory Item', () => {
  // Starlite and M80 are the fleet's own deliberate, documented exceptions
  // (see their comments in src/data/seed.ts) — Starlite is explicitly
  // "Unknown / Future," and M80 is the regression fixture
  // src/utils/__tests__/unresolvedFactoryData.test.ts depends on for
  // proving genuine Unresolved status is reachable from real seed data,
  // not just a synthetic fixture. Every other seed ship (135c, UTV, Mole,
  // Cutlass Black, Vulture, Prospector) had its gap closed this mission.
  const DOCUMENTED_EXCEPTIONS = new Set(['starlite', 'm80'])

  it('6. across the entire seed fleet, only the deliberately-documented exception ships show Unknown Factory Item', () => {
    const offenders = hardpoints.filter((h) => h.factoryItem === 'Unknown Factory Item' && !DOCUMENTED_EXCEPTIONS.has(h.shipId))
    expect(offenders).toEqual([])
  })

  it('7. every non-exception seed ship has at least one real, resolved (status OK) hardpoint — no ship is entirely unresolved', () => {
    for (const ship of ships) {
      if (DOCUMENTED_EXCEPTIONS.has(ship.id)) continue
      const rows = hardpoints.filter((h) => h.shipId === ship.id)
      const resolvedCount = rows.filter((h) => h.status === 'OK' && h.factoryItem !== '—').length
      expect(resolvedCount).toBeGreaterThan(0)
    }
  })
})
