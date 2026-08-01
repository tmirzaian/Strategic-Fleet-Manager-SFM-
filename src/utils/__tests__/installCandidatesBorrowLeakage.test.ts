import { describe, it, expect } from 'vitest'
import { deriveInstallCandidates } from '../installCandidates'
import type { TargetComponentOption } from '../../components/TargetComponentPicker'
import type { HangarItem, InstalledLoadoutEntry, MissionReservation, Ship, Build } from '../../types'

const activeShip: Ship = {
  id: 'corsair',
  name: 'Corsair',
  manufacturer: 'Drake',
  ownership: 'Owned',
  career: '',
  role: '',
  activeBuildId: 'corsair-build',
  readiness: 0,
  priority: 0,
  missing: [],
  lifecycleStatus: 'active',
}

const retiredShip: Ship = {
  id: 'railen',
  name: 'Railen',
  manufacturer: 'MISC',
  ownership: 'Owned',
  career: '',
  role: '',
  activeBuildId: 'railen-build',
  readiness: 0,
  priority: 0,
  missing: [],
  lifecycleStatus: 'retired',
}

const candidates: TargetComponentOption[] = [{ item: 'SnowBlind', path: 'Cooler / SnowBlind' }]

function baseParams(overrides: Partial<Parameters<typeof deriveInstallCandidates>[1]> = {}) {
  return {
    currentShipId: 'ghost',
    currentBuildId: 'ghost-stealth',
    currentSlotLabel: 'Left Cooler',
    hangarItems: [] as HangarItem[],
    installedLoadouts: [] as InstalledLoadoutEntry[],
    reservations: [] as MissionReservation[],
    ships: [activeShip] as Ship[],
    builds: [] as Build[],
    ...overrides,
  }
}

/**
 * EWO-088 — "Borrow-Tier Retired-Ship Leakage Fix." Before this, a donor
 * ship absent from the caller's `ships` array (i.e. retired, since every
 * real caller passes `selectActiveShips`-scoped ships per SW-015C) still
 * produced a borrowable row labeled "Unknown Ship" instead of being
 * excluded — silently offering to borrow a component that only exists on
 * a retired vessel.
 */
describe('deriveInstallCandidates — Borrow tier retired-ship exclusion (EWO-088)', () => {
  it('excludes a donor not present in `ships` entirely — no "Unknown Ship" row', () => {
    const result = deriveInstallCandidates(
      candidates,
      baseParams({
        installedLoadouts: [{ shipId: 'railen', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' }],
        ships: [activeShip], // retiredShip deliberately NOT included, mirroring selectActiveShips(ships)
      })
    )
    expect(result.borrowable).toHaveLength(0)
  })

  it('still surfaces a genuinely active donor by real name', () => {
    const result = deriveInstallCandidates(
      candidates,
      baseParams({
        installedLoadouts: [{ shipId: 'corsair', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' }],
        ships: [activeShip],
      })
    )
    expect(result.borrowable).toHaveLength(1)
    expect(result.borrowable[0].shipName).toBe('Corsair')
    expect(result.borrowable[0].shipId).toBe('corsair')
  })

  it('excludes the retired donor but still surfaces a separate active donor for the same component', () => {
    const result = deriveInstallCandidates(
      candidates,
      baseParams({
        installedLoadouts: [
          { shipId: 'railen', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' },
          { shipId: 'corsair', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' },
        ],
        ships: [activeShip], // only the active one — retiredShip intentionally omitted
      })
    )
    expect(result.borrowable).toHaveLength(1)
    expect(result.borrowable[0].shipName).toBe('Corsair')
  })

  it('a donor present in `ships` (even if its own lifecycleStatus were "retired") is trusted — filtering is the caller\'s contract, not re-derived here', () => {
    // Documents the resolver's actual contract (§ EWO-088 doc comment):
    // it trusts `ships` to already be active-scoped rather than reading
    // `lifecycleStatus` itself, matching every other consumer of this
    // parameter across the codebase (SW-015C).
    const result = deriveInstallCandidates(
      candidates,
      baseParams({
        installedLoadouts: [{ shipId: 'railen', slotLabel: 'Cooler 1', installedItem: 'SnowBlind' }],
        ships: [activeShip, retiredShip],
      })
    )
    expect(result.borrowable).toHaveLength(1)
    expect(result.borrowable[0].shipName).toBe('Railen')
  })
})
