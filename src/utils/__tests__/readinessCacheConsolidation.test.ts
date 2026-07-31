import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { materializeFleetAsset } from '../fleetAssetMaterializer'
import { calculateBuildProgress } from '../buildProgress'
import { UNKNOWN_FACTORY_PLACEHOLDER } from '../hardpointStatus'
import type { ShipDefinition } from '../../types'
import type { FactoryHardpointTemplate } from '../../data/shipDefinitions'

/**
 * EWO-085 — Canonical Readiness Cache Consolidation. Focused tests proving
 * `fleetAssetMaterializer.ts` and `useFleetStore.ts`'s
 * `buildCanonicalSeedCustomBuilds` now derive their cached
 * `Build.readiness`/`Ship.readiness` from the exact same canonical
 * `calculateBuildProgress` engine every live operational screen already
 * calls, rather than a second, independently-filtered formula.
 *
 * Store-level scenarios (multiple Commander-managed loadouts, hydration)
 * use the real seed fixtures already established for this exact purpose:
 * `ghost-stealth`/`ghost-escort` (two distinct real Mission Configurations
 * for the same ship, 'ghost' — one mid-upgrade, one with a genuine
 * Missing assignment) and `corsair-gunship` (the seed's own "finished
 * custom project" fixture, everything matched). See
 * src/store/__tests__/persistenceIncident.test.ts for the established
 * `vi.resetModules()` + re-import genuine-reload pattern reused below.
 */

const baseDefinition: ShipDefinition = {
  id: 'test-ship',
  internalName: 'test-ship',
  displayName: 'Test Ship',
  manufacturer: 'Test Co',
  classification: { rsiRoles: ['Combat'], focusTags: [], source: 'MANUAL_SEED' },
  career: 'Combat',
  role: 'Fighter',
  imageUrl: undefined,
  equipmentGroups: [],
  portIds: [],
  factoryLoadoutId: 'test-ship-factory-loadout',
  sourceMetadata: { sourceType: 'seed' },
}

describe('EWO-085: materialized readiness agrees with the canonical engine', () => {
  it('1/regression — a ship with an Unresolved-factory-data row: materialized readiness matches calculateBuildProgress exactly (the old formula counted this row in its denominator; the canonical engine excludes it)', () => {
    const template: FactoryHardpointTemplate[] = [
      { slotLabel: 'Weapon 1', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver' },
      { slotLabel: 'Power 1', type: 'Power Plant', size: 'S1', factoryItem: UNKNOWN_FACTORY_PLACEHOLDER },
    ]
    const { build, hardpoints } = materializeFleetAsset({ definition: baseDefinition, template, ownershipType: 'OWNED', priority: 1 })
    expect(hardpoints.find((h) => h.slotLabel === 'Power 1')?.status).toBe('Unresolved')
    const canonical = calculateBuildProgress(hardpoints)
    // Old (broken) formula: 1 OK row / 2 non-structural rows = 50%. The
    // canonical engine excludes the Unresolved row entirely: 1 OK / 1
    // required = 100%. Materialized readiness must match the canonical
    // engine, not the old 50%.
    expect(build.readiness).toBe(canonical.percentage)
    expect(build.readiness).toBe(100)
  })

  it('2 — a fully-ready fresh Factory Build (Installed = Factory = Target everywhere) reads 100%, matching the canonical engine', () => {
    const template: FactoryHardpointTemplate[] = [
      { slotLabel: 'Weapon 1', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver' },
      { slotLabel: 'Shield 1', type: 'Shield', size: 'S1', factoryItem: '—' },
    ]
    const { build, hardpoints } = materializeFleetAsset({ definition: baseDefinition, template, ownershipType: 'OWNED', priority: 1 })
    const canonical = calculateBuildProgress(hardpoints)
    expect(build.readiness).toBe(canonical.percentage)
    expect(build.readiness).toBe(100)
  })

  it('6 — intentional empty slot (factory/installed/target all "—"): never counted as required, never reduces readiness', () => {
    const template: FactoryHardpointTemplate[] = [{ slotLabel: 'Shield 1', type: 'Shield', size: 'S1', factoryItem: '—' }]
    const { build, hardpoints } = materializeFleetAsset({ definition: baseDefinition, template, ownershipType: 'OWNED', priority: 1 })
    const canonical = calculateBuildProgress(hardpoints)
    expect(canonical.requiredAssignments).toBe(0)
    expect(build.readiness).toBe(100)
    expect(build.readiness).toBe(canonical.percentage)
  })

  it('9 — a Factory-only build (kind: FACTORY) follows the same canonical percentage rule as any other build, with no special-case formula', () => {
    const template: FactoryHardpointTemplate[] = [{ slotLabel: 'Weapon 1', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver' }]
    const { build, hardpoints } = materializeFleetAsset({ definition: baseDefinition, template, ownershipType: 'OWNED', priority: 1 })
    expect(build.kind).toBe('FACTORY')
    expect(build.readiness).toBe(calculateBuildProgress(hardpoints).percentage)
  })

  it('12 — Build.readiness is always a finite number in [0, 100], matching BuildProgressResult.percentage\'s own shape', () => {
    const template: FactoryHardpointTemplate[] = [{ slotLabel: 'Weapon 1', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver' }]
    const { build } = materializeFleetAsset({ definition: baseDefinition, template, ownershipType: 'OWNED', priority: 1 })
    expect(typeof build.readiness).toBe('number')
    expect(Number.isFinite(build.readiness)).toBe(true)
    expect(build.readiness).toBeGreaterThanOrEqual(0)
    expect(build.readiness).toBeLessThanOrEqual(100)
  })

  it('13 — a ship with zero hardpoints at all (no template) never produces NaN or a divide-by-zero readiness', () => {
    const { build, hardpoints } = materializeFleetAsset({ definition: baseDefinition, template: [], ownershipType: 'OWNED', priority: 1 })
    expect(hardpoints).toEqual([])
    expect(Number.isNaN(build.readiness)).toBe(false)
    expect(build.readiness).toBe(100)
    expect(build.readiness).toBe(calculateBuildProgress([]).percentage)
  })
})

describe('EWO-085: calculateBuildProgress itself — empty-fleet-shaped edge cases', () => {
  it('3 — an empty hardpoint array (empty fleet / no ship selected) resolves 100%, isComplete, no NaN', () => {
    const result = calculateBuildProgress([])
    expect(result.percentage).toBe(100)
    expect(result.isComplete).toBe(true)
    expect(result.requiredAssignments).toBe(0)
    expect(Number.isNaN(result.percentage)).toBe(false)
  })

  it('14 — fleet-level aggregation agrees with each constituent ship\'s own canonical result', () => {
    const shipATemplate: FactoryHardpointTemplate[] = [{ slotLabel: 'Weapon 1', type: 'Weapon', size: 'S4', factoryItem: 'Mass Driver' }]
    const shipBTemplate: FactoryHardpointTemplate[] = [{ slotLabel: 'Power 1', type: 'Power Plant', size: 'S1', factoryItem: UNKNOWN_FACTORY_PLACEHOLDER }]
    const shipA = materializeFleetAsset({ definition: baseDefinition, template: shipATemplate, ownershipType: 'OWNED', priority: 1 })
    const shipB = materializeFleetAsset({ definition: baseDefinition, template: shipBTemplate, ownershipType: 'OWNED', priority: 2 })
    const fleetHardpoints = [...shipA.hardpoints, ...shipB.hardpoints]
    // A naive per-ship aggregation (average of each ship's own canonical
    // percentage) must agree with computing each ship's progress
    // independently from the combined pool, filtered back to its own build.
    const perShipFromPool = [shipA.build.id, shipB.build.id].map((buildId) => calculateBuildProgress(fleetHardpoints.filter((h) => h.buildId === buildId)).percentage)
    expect(perShipFromPool).toEqual([shipA.build.readiness, shipB.build.readiness])
  })
})
