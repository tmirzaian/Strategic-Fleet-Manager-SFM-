import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { ships as seedShips, builds as seedBuilds } from '../../data/seed'
import { shipFactoryTemplates } from '../../data/shipDefinitions'
import { calculateBuildProgress } from '../../utils/buildProgress'
import { deriveFleetBuildState } from '../../utils/fleetBuildState'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

/**
 * SW-005 Phase 2 — Canonical Factory Construction (supersedes SW-003's own
 * coverage in this file).
 *
 * SW-003 gave every seed ship a real `kind: 'FACTORY'` Build, but derived
 * its content from that ship's own hand-authored CUSTOM build (seed.ts's
 * `factoryVariantOf`) — a stopgap that left the Factory Loadout's port
 * *layout* still diverged from canonical topology (SW-004's finding). SW-005
 * Phase 2 retired that stopgap: every seed ship's Factory Loadout is now
 * constructed fresh by `materializeFleetAsset` against the ship's own real
 * canonical `shipFactoryTemplates` entry — the exact same authority a
 * manually-added Fleet Asset already used (`useFleetStore.ts`'s
 * `buildCanonicalSeedFactoryBuilds`). This is the actual convergence: a
 * seed ship's Factory Loadout and a freshly-added copy's Factory Loadout
 * are now the same construction, not just the same Build discriminators.
 *
 * Factory Loadouts live in the STORE now, not in raw `src/data/seed.ts`
 * exports (`seedBuilds`/`seedHardpoints` contain CUSTOM builds only) — so
 * every assertion about Factory content here reads `useFleetStore.getState()`.
 */
describe('SW-005 Phase 2: every seeded ship has exactly one canonical Factory Build', () => {
  it('1. every seed ship (12) has exactly one Build with kind FACTORY', () => {
    const s = useFleetStore.getState()
    for (const ship of seedShips) {
      const factoryBuilds = s.builds.filter((b) => b.shipId === ship.id && b.kind === 'FACTORY')
      expect(factoryBuilds).toHaveLength(1)
      expect(factoryBuilds[0].name).toBe('Factory Loadout')
    }
  })

  it('2. the Factory Build has real Factory hardpoints — every row is Installed = Target = Factory, by construction', () => {
    const s = useFleetStore.getState()
    for (const ship of seedShips) {
      const factoryBuild = s.builds.find((b) => b.shipId === ship.id && b.kind === 'FACTORY')!
      const rows = s.hardpoints.filter((h) => h.buildId === factoryBuild.id)
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.installedItem).toBe(row.factoryItem)
        expect(row.targetItem).toBe(row.factoryItem)
      }
    }
  })

  it('3. existing custom Mission Configuration identity is preserved untouched — Factory Loadout was added/regenerated, never substituted', () => {
    // SW-006 — every original build id/kind/name/isActive survives
    // exactly (Identity Before Topology); only the mechanical structure
    // moved to canonical construction (useFleetStore.ts's
    // buildCanonicalSeedCustomBuilds), so these builds no longer live in
    // raw seedBuilds directly — the live store is the correct read.
    const s = useFleetStore.getState()
    const ghostStealth = s.builds.find((b) => b.id === 'ghost-stealth')!
    const ghostEscort = s.builds.find((b) => b.id === 'ghost-escort')!
    const corsairGunship = s.builds.find((b) => b.id === 'corsair-gunship')!
    expect(ghostStealth.kind).toBe('CUSTOM')
    expect(ghostEscort.kind).toBe('CUSTOM')
    expect(corsairGunship.kind).toBe('CUSTOM')
    // Ghost's real demo customization (seed.ts's customBuildOverlays) is
    // present against the real canonical port.
    expect(s.hardpoints.some((h) => h.buildId === 'ghost-stealth' && h.slotLabel === 'Power Plant' && h.targetItem === 'Slipstream')).toBe(true)

    // 135c/UTV never had a custom Build (their only Build was always
    // Factory) — still true, just no longer hand-authored in seed.ts.
    expect(seedBuilds.filter((b) => b.shipId === '135c')).toHaveLength(0)
    expect(seedBuilds.filter((b) => b.shipId === 'utv')).toHaveLength(0)
    expect(s.builds.filter((b) => b.shipId === '135c')).toHaveLength(1)
    expect(s.builds.filter((b) => b.shipId === 'utv')).toHaveLength(1)
  })

  it("4. the Commander's existing active build selection is untouched — every ship's activeBuildId still points at its original build, never the new Factory Loadout", () => {
    const s = useFleetStore.getState()
    expect(s.ships.find((sh) => sh.id === 'ghost')!.activeBuildId).toBe('ghost-stealth')
    expect(s.ships.find((sh) => sh.id === 'corsair')!.activeBuildId).toBe('corsair-gunship')
    for (const ship of seedShips) {
      const factoryBuild = s.builds.find((b) => b.shipId === ship.id && b.kind === 'FACTORY')!
      if (factoryBuild.id !== ship.activeBuildId) {
        expect(factoryBuild.isActive).toBe(false)
      }
    }
  })
})

describe('SW-005 Phase 2: Factory Template authority resolves to real canonical topology (SW-003\'s known limitation, now closed)', () => {
  it("5. shipFactoryTemplates[shipId] and the live Factory Build's own hardpoints now agree exactly — every seed ship, not just non-superseded ones", () => {
    const s = useFleetStore.getState()
    for (const ship of seedShips) {
      const factoryBuild = s.builds.find((b) => b.shipId === ship.id && b.kind === 'FACTORY')!
      const factoryRows = s.hardpoints.filter((h) => h.buildId === factoryBuild.id)
      const template = shipFactoryTemplates[ship.id]
      expect(template).toBeDefined()
      expect(factoryRows.length).toBe(template.length)
      for (const row of factoryRows) {
        const templateRow = template.find((t) => t.slotLabel === row.slotLabel)
        expect(templateRow).toBeDefined()
        expect(templateRow!.factoryItem).toBe(row.factoryItem)
      }
    }
  })

  it('6. the Factory Build is unambiguous and independently addressable by kind, regardless of what the Commander has active', () => {
    const s = useFleetStore.getState()
    for (const ship of seedShips) {
      const factoryBuild = s.builds.find((b) => b.shipId === ship.id && b.kind === 'FACTORY')!
      expect(factoryBuild).toBeDefined()
      if (ship.activeBuildId !== factoryBuild.id) {
        const activeBuild = s.builds.find((b) => b.id === ship.activeBuildId)!
        expect(activeBuild.kind).not.toBe('FACTORY')
      }
    }
  })
})

describe('SW-005 Phase 2: seeded and manually-added copies of the same hull now converge on identical Factory structure', () => {
  it('7. a freshly-added ship (MANUAL) gets a Build with kind FACTORY, name "Factory Loadout", Installed=Target=Factory everywhere', () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const result = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    expect(result.success).toBe(true)
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === result.assetId)!
    const build = useFleetStore.getState().builds.find((b) => b.id === asset.activeBuildId)!
    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === build.id)

    expect(build.kind).toBe('FACTORY')
    expect(build.name).toBe('Factory Loadout')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.installedItem).toBe(row.factoryItem)
      expect(row.targetItem).toBe(row.factoryItem)
    }
  })

  it('8. a freshly-added Ghost (MANUAL) and the seed Ghost\'s Factory Loadout now have the exact same ports, in the exact same real canonical topology', () => {
    const ghostDef = useFleetStore.getState().shipDefinitions.find((d) => d.id === 'ghost')!
    const result = useFleetStore.getState().addFleetAsset(ghostDef.id, 'OWNED')
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === result.assetId)!
    const freshRows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === asset.activeBuildId)

    const seedGhostFactoryBuild = useFleetStore.getState().builds.find((b) => b.shipId === 'ghost' && b.kind === 'FACTORY')!
    const seedFactoryRows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === seedGhostFactoryBuild.id)

    expect(freshRows.map((h) => h.slotLabel).sort()).toEqual(seedFactoryRows.map((h) => h.slotLabel).sort())
    for (const row of seedFactoryRows) {
      const match = freshRows.find((h) => h.slotLabel === row.slotLabel)!
      expect(match.factoryItem).toBe(row.factoryItem)
    }
  })
})

describe('SW-005 Phase 2: Quartermaster readiness classification is deterministic and correct — the two SW-003 exceptions are gone', () => {
  it('9. every seed ship\'s new Factory Loadout build classifies FACTORY_ONLY — never MISSION_READY, and never a false INVALID_BUILD from stale hand-authored data', () => {
    // M80's Quantum Drive / Mole's Mining Head 1 size mismatches (SW-003's
    // temporary exceptions) were artifacts of deriving Factory content from
    // seed.ts's own CUSTOM build values — the real canonical StarBreaker
    // data behind both hulls is clean (GF-002B). M80's own hand-authored
    // CUSTOM build (m80-speed, the deliberate Golden Scenario H regression
    // fixture) is untouched and still genuinely invalid — but that's a
    // different Build, not the Factory Loadout.
    const s = useFleetStore.getState()
    for (const ship of seedShips) {
      const factoryBuild = s.builds.find((b) => b.shipId === ship.id && b.kind === 'FACTORY')!
      const rows = s.hardpoints.filter((h) => h.buildId === factoryBuild.id)
      const progress = calculateBuildProgress(rows)
      expect(deriveFleetBuildState(factoryBuild, progress)).toBe('FACTORY_ONLY')
    }
  })

  it('10. a freshly manually-added ship\'s Factory Loadout classifies FACTORY_ONLY too — the same rule, the same outcome, regardless of acquisition source', () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const result = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === result.assetId)!
    const build = useFleetStore.getState().builds.find((b) => b.id === asset.activeBuildId)!
    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === build.id)
    const progress = calculateBuildProgress(rows)
    expect(deriveFleetBuildState(build, progress)).toBe('FACTORY_ONLY')
  })
})

describe("SW-003: the Commander's selected active Build never alters Factory Template authority", () => {
  it('11. switching the active build on a live seed ship does not change shipFactoryTemplates for that ship — it is a fixed module-level export, never recomputed from live store state', () => {
    const before = shipFactoryTemplates['ghost']
    useFleetStore.getState().setActiveBuild('ghost', 'ghost-escort')
    const after = shipFactoryTemplates['ghost']
    expect(after).toBe(before)
  })
})
