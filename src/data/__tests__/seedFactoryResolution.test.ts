import { describe, it, expect, beforeEach } from 'vitest'
import { ships as seedShips } from '../seed'
import { shipFactoryTemplates } from '../shipDefinitions'
import { useFleetStore } from '../../store/useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

/**
 * EWO-031 (Task 6/7) — Canonical Factory Template Audit. Root cause of the
 * originally-reported Origin 135c bug: 135c and UTV were the only two seed
 * ships whose hand-authored hardpoints came from bare `defaultBuildHardpoints()`
 * with zero overrides, so every one of their 11 slots fell through to the
 * 'Unknown Factory Item' placeholder.
 *
 * SW-005 Phase 2 superseded the original hand-authored fix entirely: 135c
 * and UTV's Factory Loadout (their only Build) is no longer hand-typed in
 * src/data/seed.ts at all — it's constructed fresh from real canonical
 * StarBreaker topology (useFleetStore.ts's buildCanonicalSeedFactoryBuilds),
 * confirmed clean (zero Unknown Factory Item, zero Invalid Target) by the
 * Golden Fleet operation's own GF-002B audit. These tests now verify the
 * live store's constructed result rather than a raw seed.ts fixture.
 */
describe('EWO-031 / SW-005 Phase 2: Origin 135c and UTV factory resolution', () => {
  it('1. no 135c hardpoint shows Unknown Factory Item for Factory or Installed', () => {
    const rows = useFleetStore.getState().hardpoints.filter((h) => h.shipId === '135c')
    expect(rows.length).toBeGreaterThan(0)
    for (const h of rows) {
      expect(h.factoryItem).not.toBe('Unknown Factory Item')
      expect(h.installedItem).not.toBe('Unknown Factory Item')
    }
  })

  it('2. no UTV hardpoint shows Unknown Factory Item for Factory or Installed', () => {
    const rows = useFleetStore.getState().hardpoints.filter((h) => h.shipId === 'utv')
    expect(rows.length).toBeGreaterThan(0)
    for (const h of rows) {
      expect(h.factoryItem).not.toBe('Unknown Factory Item')
      expect(h.installedItem).not.toBe('Unknown Factory Item')
    }
  })

  it('3. every 135c and UTV hardpoint resolves to status OK — no Unresolved, no Invalid Target', () => {
    for (const shipId of ['135c', 'utv']) {
      const rows = useFleetStore.getState().hardpoints.filter((h) => h.shipId === shipId)
      for (const h of rows) {
        expect(h.status).toBe('OK')
      }
    }
  })

  it('4. 135c and UTV Target values resolve to something real (not the pre-fix asymmetry where only Target was valid)', () => {
    for (const shipId of ['135c', 'utv']) {
      const rows = useFleetStore.getState().hardpoints.filter((h) => h.shipId === shipId && h.targetItem !== '—')
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
  // Starlite and M80's own hand-authored CUSTOM builds remain the fleet's
  // deliberate, documented exceptions (see their comments in
  // src/data/seed.ts) — Starlite is explicitly "Unknown / Future," and M80
  // is the regression fixture src/utils/__tests__/unresolvedFactoryData.test.ts
  // depends on. Their Factory Loadouts (SW-005 Phase 2, canonical-derived)
  // are unaffected by either exception — only the hand-authored CUSTOM
  // builds carry it.
  const DOCUMENTED_EXCEPTIONS = new Set(['starlite', 'm80'])

  it('6. across the entire seed fleet, only the deliberately-documented exception ships show Unknown Factory Item', () => {
    const hardpoints = useFleetStore.getState().hardpoints
    const offenders = hardpoints.filter((h) => h.factoryItem === 'Unknown Factory Item' && !DOCUMENTED_EXCEPTIONS.has(h.shipId))
    expect(offenders).toEqual([])
  })

  it('7. every non-exception seed ship has at least one real, resolved (status OK) hardpoint — no ship is entirely unresolved', () => {
    const hardpoints = useFleetStore.getState().hardpoints
    for (const ship of seedShips) {
      if (DOCUMENTED_EXCEPTIONS.has(ship.id)) continue
      const rows = hardpoints.filter((h) => h.shipId === ship.id)
      const resolvedCount = rows.filter((h) => h.status === 'OK' && h.factoryItem !== '—').length
      expect(resolvedCount).toBeGreaterThan(0)
    }
  })
})
