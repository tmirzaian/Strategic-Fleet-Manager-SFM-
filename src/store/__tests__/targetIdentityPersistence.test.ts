import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { validateTargetCompatibility } from '../../data/componentCatalog'
import { shipDefinitions } from '../../data/shipDefinitions'

/**
 * Adds a genuinely fresh Fleet Asset from the real Polaris ShipDefinition
 * (`addFleetAsset`, the same production path "Add Ship" uses) rather than
 * reusing a seed ship, for the tests below that need a real PDC-capable
 * port. SW-006 — Ghost's own CUSTOM builds are now constructed fresh from
 * canonical topology too (useFleetStore.ts's buildCanonicalSeedCustomBuilds),
 * so 'ghost' + its real canonical slotLabel ("Left Shield Generator") is
 * used directly elsewhere in this file for identity-persistence coverage
 * that doesn't need a genuinely PDC-shaped port.
 */
function addFreshPolaris(nickname: string) {
  const definition = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Polaris')
  if (!definition) return null
  const result = useFleetStore.getState().addFleetAsset(definition.id, 'OWNED', nickname)
  if (!result.success || !result.assetId) return null
  return useFleetStore.getState().ships.find((s) => s.id === result.assetId) ?? null
}

/**
 * EWO-STAB-004B (ADR-010) — addendum to EWO-STAB-004A: completes the
 * canonical identity chain for Commander selections made through
 * component pickers/loadout editors. The twelve required regression
 * scenarios.
 *
 * Real fixtures throughout: `Turret_PDC_BEHR_A`/`Turret_PDC_VNCL`
 * (category Turret, subtype PDCTurret, size 2, display name
 * `M2C "Swarm"`) and `BEHR_LaserRepeater_PDC_S1` (category WeaponGun,
 * subtype Gun, size 1, the SAME display name) — the exact three-entity
 * collision CAT-003/EWO-STAB-004A certified and fixed at the
 * compatibility layer. This mission closes the remaining gap: a
 * Commander's specific entityClass selection surviving into
 * `Hardpoint.targetEntityClass` and back out through a genuine
 * save/reload cycle.
 */

const PDC_BEHR = 'Turret_PDC_BEHR_A'
const PDC_VNCL = 'Turret_PDC_VNCL'
const PDC_GUN = 'BEHR_LaserRepeater_PDC_S1'
const SWARM_NAME = 'M2C "Swarm"'

const hasCatalog = validateTargetCompatibility(SWARM_NAME, 'Turret', 'S2', { itemEntityClass: PDC_BEHR, destinationFactoryEntityClass: PDC_BEHR }).valid

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})
afterEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('EWO-STAB-004B: selection identity is persisted, not just validated in-memory', () => {
  it('1. selecting Turret_PDC_BEHR_A stores targetEntityClass', () => {
    if (!hasCatalog) return
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 1',
      startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': { targetItem: SWARM_NAME, targetEntityClass: PDC_BEHR } },
      setActive: false,
    })
    expect(save.success).toBe(true)
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === save.buildId && h.slotLabel === 'Left Shield Generator')!
    expect(hp.targetItem).toBe(SWARM_NAME)
    expect(hp.targetEntityClass).toBe(PDC_BEHR)
  })

  it('2. selecting Turret_PDC_VNCL stores its distinct entityClass despite the same display name and compatibility shape', () => {
    if (!hasCatalog) return
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 2',
      startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': { targetItem: SWARM_NAME, targetEntityClass: PDC_VNCL } },
      setActive: false,
    })
    expect(save.success).toBe(true)
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === save.buildId && h.slotLabel === 'Left Shield Generator')!
    expect(hp.targetItem).toBe(SWARM_NAME)
    expect(hp.targetEntityClass).toBe(PDC_VNCL)
    expect(hp.targetEntityClass).not.toBe(PDC_BEHR)
  })

  it('3. selecting BEHR_LaserRepeater_PDC_S1 stores the S1 gun identity, not either S2 turret identity', () => {
    if (!hasCatalog) return
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 3',
      startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': { targetItem: SWARM_NAME, targetEntityClass: PDC_GUN } },
      setActive: false,
    })
    expect(save.success).toBe(true)
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === save.buildId && h.slotLabel === 'Left Shield Generator')!
    expect(hp.targetEntityClass).toBe(PDC_GUN)
    expect(hp.targetEntityClass).not.toBe(PDC_BEHR)
    expect(hp.targetEntityClass).not.toBe(PDC_VNCL)
  })

  it('4. save and rehydration preserve the exact selected entityClass', async () => {
    if (!hasCatalog) return
    const ship = addFreshPolaris('Test 4 Polaris')
    if (!ship) return
    const pdcRow = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.factoryEntityClass === PDC_BEHR)
    if (!pdcRow) return
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: ship.id,
      name: '004B Test 4',
      startingState: 'EMPTY',
      targetOverrides: { [pdcRow.slotLabel]: { targetItem: SWARM_NAME, targetEntityClass: PDC_BEHR } },
      setActive: true,
    })
    expect(save.success).toBe(true)

    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const hp = reloaded.getState().hardpoints.find((h) => h.buildId === save.buildId && h.slotLabel === pdcRow.slotLabel)!
    expect(hp.targetItem).toBe(SWARM_NAME)
    expect(hp.targetEntityClass).toBe(PDC_BEHR)
  })

  it('5. a same-name selection change updates entityClass even though targetItem text remains unchanged', () => {
    if (!hasCatalog) return
    const first = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 5',
      startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': { targetItem: SWARM_NAME, targetEntityClass: PDC_BEHR } },
      setActive: false,
    })
    expect(first.success).toBe(true)
    const second = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 5',
      startingState: 'EXISTING',
      existingBuildId: first.buildId,
      targetOverrides: { 'Left Shield Generator': { targetItem: SWARM_NAME, targetEntityClass: PDC_VNCL } },
      setActive: false,
    })
    expect(second.success).toBe(true)
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === second.buildId && h.slotLabel === 'Left Shield Generator')!
    expect(hp.targetItem).toBe(SWARM_NAME)
    expect(hp.targetEntityClass).toBe(PDC_VNCL)
  })

  it('6. replacing a canonical selection with uncataloged free text clears the old entityClass', () => {
    if (!hasCatalog) return
    const first = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 6',
      startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': { targetItem: SWARM_NAME, targetEntityClass: PDC_BEHR } },
      setActive: false,
    })
    expect(first.success).toBe(true)
    const second = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 6',
      startingState: 'EXISTING',
      existingBuildId: first.buildId,
      targetOverrides: { 'Left Shield Generator': { targetItem: 'Totally Custom Uncataloged Part' } },
      setActive: false,
    })
    expect(second.success).toBe(true)
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === second.buildId && h.slotLabel === 'Left Shield Generator')!
    expect(hp.targetItem).toBe('Totally Custom Uncataloged Part')
    expect(hp.targetEntityClass).toBeUndefined()
  })

  it('7. clearing a target cannot leave an orphaned targetEntityClass', () => {
    if (!hasCatalog) return
    const first = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 7',
      startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': { targetItem: SWARM_NAME, targetEntityClass: PDC_BEHR } },
      setActive: false,
    })
    expect(first.success).toBe(true)
    // A malformed/defensive combination — targetItem cleared but a stale
    // entityClass still supplied — must never survive; '—' always wins.
    const second = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 7',
      startingState: 'EXISTING',
      existingBuildId: first.buildId,
      targetOverrides: { 'Left Shield Generator': { targetItem: '—', targetEntityClass: PDC_BEHR } },
      setActive: false,
    })
    expect(second.success).toBe(true)
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === second.buildId && h.slotLabel === 'Left Shield Generator')!
    expect(hp.targetItem).toBe('—')
    expect(hp.targetEntityClass).toBeUndefined()
  })

  it('8. legacy persisted target overrides containing only targetItem (a plain string) still load', () => {
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 8',
      startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': 'Mirage' },
      setActive: false,
    })
    expect(save.success).toBe(true)
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === save.buildId && h.slotLabel === 'Left Shield Generator')!
    expect(hp.targetItem).toBe('Mirage')
    expect(hp.status).not.toBe('Invalid Target')
  })

  it('9. a rehydrated canonical PDC target validates on the correct PDC port and remains incompatible with an ordinary S2 weapon port', async () => {
    if (!hasCatalog) return
    const ship = addFreshPolaris('Test 9 Polaris')
    if (!ship) return
    const pdcRow = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.factoryEntityClass === PDC_BEHR)
    if (!pdcRow) return
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: ship.id,
      name: '004B Test 9',
      startingState: 'EMPTY',
      targetOverrides: { [pdcRow.slotLabel]: { targetItem: SWARM_NAME, targetEntityClass: PDC_BEHR } },
      setActive: true,
    })
    expect(save.success).toBe(true)

    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const hp = reloaded.getState().hardpoints.find((h) => h.buildId === save.buildId && h.slotLabel === pdcRow.slotLabel)!
    expect(hp.targetEntityClass).toBe(PDC_BEHR)
    expect(hp.targetEntityClass).not.toBe(PDC_GUN)

    // Validates on a native PDC-capable destination.
    const onPdcPort = validateTargetCompatibility(hp.targetItem, 'Turret', 'S2', { itemEntityClass: hp.targetEntityClass, destinationFactoryEntityClass: PDC_BEHR })
    expect(onPdcPort.valid, onPdcPort.message).toBe(true)
    expect(onPdcPort.reason).toBeUndefined()

    // Remains incompatible with an ordinary S2 weapon port.
    const onOrdinaryPort = validateTargetCompatibility(hp.targetItem, 'Weapon', 'S2', { itemEntityClass: hp.targetEntityClass, destinationFactoryEntityClass: undefined })
    expect(onOrdinaryPort.valid).toBe(false)
  })

  it('10. an ambiguous name-only legacy target remains safely ambiguous rather than gaining an invented entityClass', () => {
    if (!hasCatalog) return
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 10',
      startingState: 'EMPTY',
      // Plain string override — no entityClass supplied, exactly like a
      // pre-EWO-STAB-004B persisted save.
      targetOverrides: { 'Left Shield Generator': SWARM_NAME },
      setActive: false,
    })
    expect(save.success).toBe(true)
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === save.buildId && h.slotLabel === 'Left Shield Generator')!
    expect(hp.targetItem).toBe(SWARM_NAME)
    expect(hp.targetEntityClass).toBeUndefined()
    // The status computation itself safely refuses to guess too.
    const result = validateTargetCompatibility(SWARM_NAME, 'Turret', 'S2')
    expect(result.reason).toBe('ambiguous')
  })

  it('11. build duplication preserves canonical target identity', () => {
    if (!hasCatalog) return
    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 11',
      startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': { targetItem: SWARM_NAME, targetEntityClass: PDC_VNCL } },
      setActive: false,
    })
    expect(save.success).toBe(true)
    useFleetStore.getState().duplicateBuild(save.buildId!)
    const duplicated = useFleetStore.getState().builds.find((b) => b.name === '004B Test 11 (Copy)')!
    expect(duplicated).toBeDefined()
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === duplicated.id && h.slotLabel === 'Left Shield Generator')!
    expect(hp.targetItem).toBe(SWARM_NAME)
    expect(hp.targetEntityClass).toBe(PDC_VNCL)
  })

  it('12. no inventory, reservation, or installed-state mutation occurs as a side effect of editing target intent', () => {
    if (!hasCatalog) return
    const hangarBefore = useFleetStore.getState().hangarItems
    const reservationsBefore = useFleetStore.getState().reservations
    const installedBefore = useFleetStore.getState().installedLoadouts

    const save = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '004B Test 12',
      startingState: 'EMPTY',
      targetOverrides: { 'Left Shield Generator': { targetItem: SWARM_NAME, targetEntityClass: PDC_BEHR } },
      setActive: false,
    })
    expect(save.success).toBe(true)

    expect(useFleetStore.getState().hangarItems).toBe(hangarBefore)
    expect(useFleetStore.getState().reservations).toBe(reservationsBefore)
    expect(useFleetStore.getState().installedLoadouts).toBe(installedBefore)
  })
})
