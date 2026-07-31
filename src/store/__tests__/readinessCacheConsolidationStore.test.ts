import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})
afterEach(() => {
  localStorage.clear()
})

/**
 * EWO-085 — Canonical Readiness Cache Consolidation, store-level coverage.
 * `useFleetStore.ts`'s `buildCanonicalSeedCustomBuilds` previously computed
 * a second, independent readiness formula for every seed Mission
 * Configuration; it now calls the same canonical `calculateBuildProgress`
 * engine every live operational screen already uses. These tests exercise
 * the real store (not a synthetic fixture) using the seed's own
 * already-established real fixtures:
 *   - `ghost-stealth` / `ghost-escort` — two distinct, real Commander-
 *     managed Mission Configurations for the SAME ship ('ghost'), one
 *     mid-upgrade (Upgrade Available), one with a genuine Missing
 *     assignment — see src/data/seed.ts's own doc comments on these two.
 *   - `corsair-gunship` — the seed's own "finished custom project"
 *     fixture: every relevant slot fully matched, deliberately zero
 *     overlay entries (Golden Scenario D).
 */

describe('EWO-085: store-cached readiness agrees with the canonical engine', () => {
  it('2 — every real seed custom Build\'s cached readiness matches calculateBuildProgress computed independently on its own hardpoints', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const { calculateBuildProgress } = await import('../../utils/buildProgress')
    const state = useFleetStore.getState()
    const customBuilds = state.builds.filter((b) => b.kind === 'CUSTOM')
    expect(customBuilds.length).toBeGreaterThan(0)
    for (const build of customBuilds) {
      const ownHardpoints = state.hardpoints.filter((h) => h.buildId === build.id)
      const canonical = calculateBuildProgress(ownHardpoints)
      expect(build.readiness).toBe(canonical.percentage)
      expect(build.missing.slice().sort()).toEqual([...canonical.missingAssignments, ...canonical.mismatchedAssignments].slice().sort())
    }
  })

  it('4 — corsair-gunship (the seed\'s own finished-project fixture) reads a genuine 100%, matching the canonical engine', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const { calculateBuildProgress } = await import('../../utils/buildProgress')
    const state = useFleetStore.getState()
    const build = state.builds.find((b) => b.id === 'corsair-gunship')!
    expect(build).toBeDefined()
    const ownHardpoints = state.hardpoints.filter((h) => h.buildId === build.id)
    expect(build.readiness).toBe(100)
    expect(build.readiness).toBe(calculateBuildProgress(ownHardpoints).percentage)
  })

  it('5 — ghost-escort has a genuine Missing required assignment (Power Plant -> Slipstream, never installed) and its cached readiness reflects that, matching the canonical engine', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const { calculateBuildProgress } = await import('../../utils/buildProgress')
    const state = useFleetStore.getState()
    const build = state.builds.find((b) => b.id === 'ghost-escort')!
    const ownHardpoints = state.hardpoints.filter((h) => h.buildId === build.id)
    const canonical = calculateBuildProgress(ownHardpoints)
    expect(canonical.missingAssignments).toContain('Slipstream')
    expect(build.readiness).toBeLessThan(100)
    expect(build.readiness).toBe(canonical.percentage)
    expect(build.missing).toContain('Slipstream')
  })

  it('7/8 — ghost-escort\'s Right Cooler (installed = target = HeatSafe, satisfied) and Left Shield Generator (installed Mirage, target FR-66, Upgrade Available — installed but does not satisfy target) both resolve exactly as the canonical engine says', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const { calculateBuildProgress } = await import('../../utils/buildProgress')
    const state = useFleetStore.getState()
    const build = state.builds.find((b) => b.id === 'ghost-escort')!
    const ownHardpoints = state.hardpoints.filter((h) => h.buildId === build.id)
    // Right Cooler is untouched (installed = target = factory "HeatSafe")
    // — a genuine satisfied assignment. Left Cooler is deliberately NOT
    // used here: its `installedItem` is overlaid from the ship-wide
    // shared InstalledLoadout record (SW-005 Phase 2 — "what's physically
    // installed" is one truth per ship, not per-build), which for
    // 'ghost-escort' (not the ship's active build) differs from this
    // build's own target — real, correct, pre-existing behavior, just
    // not the "satisfied" example this test wants.
    const rightCooler = ownHardpoints.find((h) => h.slotLabel === 'Right Cooler')!
    const shield = ownHardpoints.find((h) => h.slotLabel === 'Left Shield Generator')!
    expect(rightCooler.status).toBe('OK') // installed satisfies target
    expect(shield.status).toBe('Upgrade Available') // installed, but does not satisfy target
    const canonical = calculateBuildProgress(ownHardpoints)
    expect(canonical.mismatchedAssignments).toContain('FR-66')
    expect(build.readiness).toBe(canonical.percentage)
  })

  it('10 — multiple Commander-managed loadouts for the same ship (ghost-stealth, ghost-escort) are each independently correct and do not bleed into each other\'s readiness', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const { calculateBuildProgress } = await import('../../utils/buildProgress')
    const state = useFleetStore.getState()
    const stealth = state.builds.find((b) => b.id === 'ghost-stealth')!
    const escort = state.builds.find((b) => b.id === 'ghost-escort')!
    expect(stealth.shipId).toBe('ghost')
    expect(escort.shipId).toBe('ghost')
    const stealthHardpoints = state.hardpoints.filter((h) => h.buildId === stealth.id)
    const escortHardpoints = state.hardpoints.filter((h) => h.buildId === escort.id)
    expect(stealth.readiness).toBe(calculateBuildProgress(stealthHardpoints).percentage)
    expect(escort.readiness).toBe(calculateBuildProgress(escortHardpoints).percentage)
    // Distinct real Mission Configurations for the same ship must not
    // silently converge on the same cached number by coincidence of a
    // shared formula bug (the original two-cache-formula divergence risk
    // this EWO exists to eliminate).
    expect(stealth.readiness).not.toBe(escort.readiness)
  })

  it('11 — hydration does not retain stale readiness after the authoritative hardpoint state changes (a genuine reload reflects the new state, not a cached leftover)', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const { calculateBuildProgress } = await import('../../utils/buildProgress')
    const before = useFleetStore.getState().builds.find((b) => b.id === 'ghost-escort')!
    expect(before.readiness).toBeLessThan(100)

    // Resolve the real Missing assignment via the same live engine path a
    // Commander installing the component would use.
    useFleetStore.getState().addHangarItem({ name: 'Slipstream', type: 'Power Plant', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Install' })
    const installResult = useFleetStore.getState().installComponent('ghost', 'Slipstream', 'Power Plant')
    expect(installResult.matched).toBe(true)

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const { calculateBuildProgress: canonicalAfterReload } = await import('../../utils/buildProgress')
    const after = reloaded.getState().builds.find((b) => b.id === 'ghost-escort')!
    const afterHardpoints = reloaded.getState().hardpoints.filter((h) => h.buildId === 'ghost-escort')
    expect(after.readiness).toBe(canonicalAfterReload(afterHardpoints).percentage)
    expect(after.readiness).toBeGreaterThan(before.readiness)
  })

  it('12 — every existing readiness consumer (Ship.readiness, Build.readiness) still receives a plain finite number, never an object or NaN', async () => {
    const { useFleetStore } = await import('../useFleetStore')
    const state = useFleetStore.getState()
    for (const ship of state.ships) {
      expect(typeof ship.readiness).toBe('number')
      expect(Number.isFinite(ship.readiness)).toBe(true)
    }
    for (const build of state.builds) {
      expect(typeof build.readiness).toBe('number')
      expect(Number.isFinite(build.readiness)).toBe(true)
    }
  })
})
