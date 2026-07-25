import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { resolveComponentByName, resolveComponentByEntityClass } from '../../generated/componentCatalog'
import { isComponentSelectableForPort } from '../../data/componentCatalog'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

const MSD_313_MISSILE_RACK = 'MRCK_S03_BEHR_Single_S03'

/**
 * SW-013C.2F Amendment A (Finding 3) — MSD-313 Rack Geometry / Child Count
 * Is Incorrect. Root cause: `src/data/componentCatalog.ts`'s hand-authored
 * `CATALOG` override table carried `'MSD-313 Missile Rack': { category:
 * 'Missile Rack', size: 3 }`, added (EWO-023) before the entityClass-first,
 * ambiguity-aware resolution chain (EWO-STAB-004A/CAT-003) existed, to
 * patch the older "first entry wins" name-only dedup bug. That override
 * unconditionally wins over entityClass-based resolution — direct catalog
 * audit found "MSD-313 Missile Rack" is now shared by FIVE real,
 * differently-shaped entityClasses (this genuine MissileLauncher/S3/1-child
 * rack, plus four unrelated BombLauncher racks on the Spirit A1/Starlancer
 * at sizes 3/5/10), so the override was forcing every one of them to the
 * SAME wrong answer. Removed; every caller that already supplies
 * `itemEntityClass` (every real compatibility/save/readiness path) now
 * resolves each ship's own real installed entity correctly.
 */
describe('SW-013C.2F Amendment A (Finding 3): MSD-313 resolves to its own real, authoritative geometry (exactly 1x S3 missile child)', () => {
  it('selecting MSD-313 for the Ghost\'s Right Missile Rack produces exactly one S3 missile child, save survives a genuine store reload', async () => {
    const before = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-stealth' && h.slotLabel === 'Right Missile Rack')!
    expect(before.factoryEntityClass).toBe('MRCK_S03_BEHR_Quad_S01') // MSD-341, the factory 4x S1 rack

    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'MSD-313 Swap Test',
      startingState: 'EXISTING',
      existingBuildId: 'ghost-stealth',
      targetOverrides: {
        [before.slotLabel]: { targetItem: 'MSD-313 Missile Rack', targetEntityClass: MSD_313_MISSILE_RACK },
      },
      setActive: true,
      saveAsNew: false,
    })
    expect(result.success).toBe(true)

    const afterHardpoints = useFleetStore.getState().hardpoints.filter((h) => h.buildId === before.buildId)
    const rack = afterHardpoints.find((h) => h.slotLabel === 'Right Missile Rack')!
    expect(rack.targetItem).toBe('MSD-313 Missile Rack')
    expect(rack.targetEntityClass).toBe(MSD_313_MISSILE_RACK)

    // The old rack's own 4x S1 children must not survive as stale
    // leftovers — component-owned child topology regenerates fresh from
    // the newly-selected rack's own real, authoritative geometry.
    const { prepareCanonicalHardpoints } = await import('../../utils/canonicalHardpointPreparation')
    const prepared = prepareCanonicalHardpoints('ghost', afterHardpoints, useFleetStore.getState().fleetAssets)
    const children = prepared.filter((h) => h.parentSlotLabel === 'Right Missile Rack')
    expect(children).toHaveLength(1)
    expect(children[0].size).toBe('S3')

    // Genuine reload — vi.resetModules() before re-import, not a
    // same-module re-import, so real rehydration/reconciliation runs.
    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const reloadedHardpoints = reloaded.getState().hardpoints.filter((h) => h.buildId === before.buildId)
    const reloadedRack = reloadedHardpoints.find((h) => h.slotLabel === 'Right Missile Rack')!
    expect(reloadedRack.targetItem).toBe('MSD-313 Missile Rack')
    expect(reloadedRack.targetEntityClass).toBe(MSD_313_MISSILE_RACK)

    const { prepareCanonicalHardpoints: prepareAfterReload } = await import('../../utils/canonicalHardpointPreparation')
    const reloadedPrepared = prepareAfterReload('ghost', reloadedHardpoints, reloaded.getState().fleetAssets)
    const reloadedChildren = reloadedPrepared.filter((h) => h.parentSlotLabel === 'Right Missile Rack')
    expect(reloadedChildren).toHaveLength(1)
    expect(reloadedChildren[0].size).toBe('S3')
  })

  it('"MSD-313 Missile Rack" now correctly reports 5 distinct real entityClasses (no longer force-collapsed by the stale CATALOG override)', () => {
    const resolution = resolveComponentByName('MSD-313 Missile Rack')
    expect(resolution.status).toBe('ambiguous')
    if (resolution.status !== 'ambiguous') return
    expect(resolution.candidates).toHaveLength(5)
    const byEntityClass = new Map(resolution.candidates.map((c) => [c.entityClass, c]))
    expect(byEntityClass.get(MSD_313_MISSILE_RACK)?.category).toBe('MissileLauncher')
    expect(byEntityClass.get(MSD_313_MISSILE_RACK)?.size).toBe(3)
    // The four unrelated BombLauncher racks (Spirit A1 S5, Starlancer S10 x2, S3) remain real, distinct, differently-shaped candidates.
    const bombRacks = resolution.candidates.filter((c) => c.category === 'BombLauncher')
    expect(bombRacks).toHaveLength(4)
  })

  it('only the genuine MissileLauncher/S3 entityClass is suggested for a Missile-Rack-typed S3 port — the unrelated BombLauncher variants correctly fail type/size, not silently forced compatible', () => {
    const resolution = resolveComponentByEntityClass(MSD_313_MISSILE_RACK)
    expect(resolution.status).toBe('resolved')
    if (resolution.status !== 'resolved') return
    expect(isComponentSelectableForPort('MSD-313 Missile Rack', 'Missile Rack', 'S3', { itemEntityClass: MSD_313_MISSILE_RACK })).toBe(true)

    const bombLauncherCandidates = (resolveComponentByName('MSD-313 Missile Rack') as { status: 'ambiguous'; candidates: { entityClass: string; category: string }[] }).candidates.filter(
      (c) => c.category === 'BombLauncher'
    )
    for (const c of bombLauncherCandidates) {
      expect(isComponentSelectableForPort('MSD-313 Missile Rack', 'Missile Rack', 'S3', { itemEntityClass: c.entityClass })).toBe(false)
    }
  })
})
