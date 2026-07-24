import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { calculateBuildProgress } from '../../utils/buildProgress'
import { componentOwnedChildSlotSpec } from '../../utils/componentOwnedSlots'
import { withMissileRackAggregation, makeMissileAggregateRow, type DisplayHardpoint } from '../../utils/missileRackAggregation'
import { buildPortTree } from '../../utils/portTree'
import { prepareCanonicalHardpoints } from '../../utils/canonicalHardpointPreparation'
import { calculateComponentAvailability } from '../../engine/logistics/availability'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

const BALL_TURRET = 'ANVL_Hornet_F7CM_Mk2_Ball_Turret'
const BALL_TURRET_BESPOKE = 'ANVL_Hornet_F7CM_Mk2_Ball_Turret_Bespoke'
const LEFT_WEAPON_A = 'Omnisky IX Cannon' // AMRS_LaserCannon_S3
const RIGHT_WEAPON_B = 'Predator Scattergun' // APAR_BallisticScatterGun_S3

/** Swaps the Ghost's Center mount to the Ball Turret and returns the two
 * synthesized "Weapon Slot" child slotLabels, in position order. */
function swapCenterToBallTurret(entityClass = BALL_TURRET) {
  const center = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-stealth' && h.sourceItemPortName === 'hardpoint_weapon_center')!
  const result = useFleetStore.getState().saveMissionConfiguration({
    shipId: 'ghost',
    name: 'Turret Swap Test',
    startingState: 'EXISTING',
    existingBuildId: 'ghost-stealth',
    targetOverrides: { [center.slotLabel]: { targetItem: entityClass === BALL_TURRET ? 'Anvil F7C-M Mk II Ball Turret' : 'TMSB-5 Ball Turret', targetEntityClass: entityClass } },
    setActive: false,
    saveAsNew: true,
  })
  expect(result.success).toBe(true)
  const rows = useFleetStore
    .getState()
    .hardpoints.filter((h) => h.buildId === result.buildId && h.parentSlotLabel === center.slotLabel)
    .sort((a, b) => a.slotLabel.localeCompare(b.slotLabel, undefined, { numeric: true }))
  return { buildId: result.buildId!, centerSlotLabel: center.slotLabel, weaponSlots: rows }
}

describe('SW-013C.2C (Objective 2/3): semantic mode is authoritative, never inferred from quantity', () => {
  it('a turret entity resolves mode "independent-equipment" and label "Weapon"', () => {
    const spec = componentOwnedChildSlotSpec(BALL_TURRET)
    expect(spec).not.toBeNull()
    expect(spec!.mode).toBe('independent-equipment')
    expect(spec!.label).toBe('Weapon')
    expect(spec!.count).toBe(2)
  })

  it('a missile rack entity still resolves mode "payload-array" — unchanged by this mission', () => {
    const rackRow = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-stealth' && h.sourceItemPortName === 'hardpoint_missile_rack_right')!
    const spec = componentOwnedChildSlotSpec(rackRow.factoryEntityClass)
    expect(spec).not.toBeNull()
    expect(spec!.mode).toBe('payload-array')
    expect(spec!.label).toBe('Missile')
  })

  it('Weapon and Missile are distinct canonical port types — payload and weapon children cannot cross compatibility modes', () => {
    const { weaponSlots } = swapCenterToBallTurret()
    expect(weaponSlots.every((s) => s.type === 'Weapon')).toBe(true)
    const rackChild = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-stealth' && h.parentSlotLabel === 'Right Missile Rack')
    expect(rackChild?.type).toBe('Missile')
  })
})

describe('SW-013C.2C (Objective 5/6): independent sibling target assignment on a Hornet turret', () => {
  it('two weapon child slots are synthesized, independently targetable, both starting empty on first swap', () => {
    const { weaponSlots } = swapCenterToBallTurret()
    expect(weaponSlots).toHaveLength(2)
    expect(weaponSlots.every((s) => s.targetItem === '—')).toBe(true)
  })

  it('mixed compatible weapon targets: Left and Right can hold genuinely different real weapons, saved and persisted', () => {
    const { buildId, weaponSlots } = swapCenterToBallTurret()
    const [slotA, slotB] = weaponSlots

    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Mixed Sibling Targets',
      startingState: 'EXISTING',
      existingBuildId: buildId,
      targetOverrides: {
        [slotA.slotLabel]: { targetItem: LEFT_WEAPON_A, targetEntityClass: 'AMRS_LaserCannon_S3' },
        [slotB.slotLabel]: { targetItem: RIGHT_WEAPON_B, targetEntityClass: 'APAR_BallisticScatterGun_S3' },
      },
      setActive: false,
      saveAsNew: false,
    })
    expect(result.success).toBe(true)

    const after = useFleetStore.getState().hardpoints.filter((h) => h.buildId === buildId)
    const afterA = after.find((h) => h.slotLabel === slotA.slotLabel)!
    const afterB = after.find((h) => h.slotLabel === slotB.slotLabel)!
    expect(afterA.targetItem).toBe(LEFT_WEAPON_A)
    expect(afterB.targetItem).toBe(RIGHT_WEAPON_B)
    expect(afterA.targetItem).not.toBe(afterB.targetItem)
    // No rack-wide/shared target field replaced the individual weapon targets.
    expect(afterA.targetEntityClass).not.toBe(afterB.targetEntityClass)
  })

  it('changing one weapon child leaves its sibling completely unchanged (no sibling-target coupling)', () => {
    const { buildId, weaponSlots } = swapCenterToBallTurret()
    const [slotA, slotB] = weaponSlots
    const first = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Coupling Test',
      startingState: 'EXISTING',
      existingBuildId: buildId,
      targetOverrides: {
        [slotA.slotLabel]: { targetItem: LEFT_WEAPON_A, targetEntityClass: 'AMRS_LaserCannon_S3' },
        [slotB.slotLabel]: { targetItem: RIGHT_WEAPON_B, targetEntityClass: 'APAR_BallisticScatterGun_S3' },
      },
      setActive: false,
      saveAsNew: false,
    })
    expect(first.success).toBe(true)

    // Change ONLY slotA.
    const second = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Coupling Test',
      startingState: 'EXISTING',
      existingBuildId: buildId,
      targetOverrides: { [slotA.slotLabel]: { targetItem: 'Omnisky IX Cannon', targetEntityClass: 'AMRS_LaserCannon_S3' } },
      setActive: false,
      saveAsNew: false,
    })
    expect(second.success).toBe(true)

    const after = useFleetStore.getState().hardpoints.filter((h) => h.buildId === buildId)
    const afterB = after.find((h) => h.slotLabel === slotB.slotLabel)!
    expect(afterB.targetItem).toBe(RIGHT_WEAPON_B) // sibling untouched
  })

  it('save and reload (genuine store rehydration via vi.resetModules — NOT a same-module re-import) preserves mixed sibling targets', async () => {
    const { buildId, weaponSlots } = swapCenterToBallTurret()
    const [slotA, slotB] = weaponSlots
    useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Reload Test',
      startingState: 'EXISTING',
      existingBuildId: buildId,
      targetOverrides: {
        [slotA.slotLabel]: { targetItem: LEFT_WEAPON_A, targetEntityClass: 'AMRS_LaserCannon_S3' },
        [slotB.slotLabel]: { targetItem: RIGHT_WEAPON_B, targetEntityClass: 'APAR_BallisticScatterGun_S3' },
      },
      setActive: true,
      saveAsNew: false,
    })

    // `vi.resetModules()` before the re-import is load-bearing: without it
    // this `import()` resolves to the SAME already-initialized module
    // (Vitest's module cache) and the store was simply never rehydrated
    // from localStorage at all — a test that would pass even if
    // rehydration silently dropped these rows. This is exactly what
    // happened here: `reconcileBuildHardpoints`'s component-owned-child
    // detection (fleetAssetReconciliation.ts) originally keyed off the
    // parent's FACTORY entity class only, which is the ordinary Cap for
    // the Hornet's Center mount, not the Ball Turret it was swapped to —
    // so on a genuine reload these two weapon-child rows matched nothing
    // in the template, were quarantined, and vanished. A same-module
    // re-import never exercises that path.
    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../useFleetStore')
    const rows = reloaded.getState().hardpoints.filter((h) => h.buildId === buildId)
    const rA = rows.find((h) => h.slotLabel === slotA.slotLabel)
    const rB = rows.find((h) => h.slotLabel === slotB.slotLabel)
    expect(rA?.targetItem).toBe(LEFT_WEAPON_A)
    expect(rB?.targetItem).toBe(RIGHT_WEAPON_B)

    const { prepareCanonicalHardpoints: prepareAfterReload } = await import('../../utils/canonicalHardpointPreparation')
    const prepared = prepareAfterReload('ghost', rows, reloaded.getState().fleetAssets)
    const preparedA = prepared.find((h) => h.slotLabel === slotA.slotLabel)
    const preparedB = prepared.find((h) => h.slotLabel === slotB.slotLabel)
    expect(preparedA?.targetItem).toBe(LEFT_WEAPON_A)
    expect(preparedB?.targetItem).toBe(RIGHT_WEAPON_B)
  })
})

describe('SW-013C.2C (Objective 5): separate readiness and inventory demand per weapon child', () => {
  it('each weapon child is independently readiness-bearing — one Missing sibling does not affect the other', () => {
    const { buildId, weaponSlots } = swapCenterToBallTurret()
    const [slotA, slotB] = weaponSlots

    // Target slotA only; slotB stays '—' (Intentional Empty, neutral).
    useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Readiness Test',
      startingState: 'EXISTING',
      existingBuildId: buildId,
      targetOverrides: { [slotA.slotLabel]: { targetItem: LEFT_WEAPON_A, targetEntityClass: 'AMRS_LaserCannon_S3' } },
      setActive: false,
      saveAsNew: false,
    })

    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === buildId)
    const rowA = rows.find((h) => h.slotLabel === slotA.slotLabel)!
    const rowB = rows.find((h) => h.slotLabel === slotB.slotLabel)!
    expect(rowA.status).toBe('Missing') // targeted, not installed
    expect(rowB.status).toBe('OK') // still Intentional Empty — neutral, unaffected by sibling

    const progress = calculateBuildProgress(rows)
    expect(progress.missingAssignments).toContain(LEFT_WEAPON_A)
    expect(progress.missingAssignments).not.toContain(RIGHT_WEAPON_B)
  })

  it('inventory demand is computed per weapon child, not pooled across siblings — mixed targets never share one demand figure', () => {
    const { buildId, weaponSlots } = swapCenterToBallTurret()
    const [slotA, slotB] = weaponSlots

    useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Inventory Demand Test',
      startingState: 'EXISTING',
      existingBuildId: buildId,
      targetOverrides: {
        [slotA.slotLabel]: { targetItem: LEFT_WEAPON_A, targetEntityClass: 'AMRS_LaserCannon_S3' },
        [slotB.slotLabel]: { targetItem: RIGHT_WEAPON_B, targetEntityClass: 'APAR_BallisticScatterGun_S3' },
      },
      setActive: false,
      saveAsNew: false,
    })

    const availabilityA = calculateComponentAvailability(LEFT_WEAPON_A, [], [], [], 'AMRS_LaserCannon_S3')
    const availabilityB = calculateComponentAvailability(RIGHT_WEAPON_B, [], [], [], 'APAR_BallisticScatterGun_S3')
    // Each child's own target name drives its own, independent demand
    // query — a shared/pooled "rack-wide" demand would collapse these two
    // distinct components into a single accounting bucket.
    expect(availabilityA.componentName).toBe(LEFT_WEAPON_A)
    expect(availabilityB.componentName).toBe(RIGHT_WEAPON_B)
    expect(availabilityA.componentName).not.toBe(availabilityB.componentName)
  })
})

describe('SW-013C.2C (Objective 7): no aggregation of independently-configurable weapon children', () => {
  it('withMissileRackAggregation leaves Weapon-labeled children completely untouched — separate rows, never folded into one', () => {
    const { buildId, weaponSlots } = swapCenterToBallTurret()
    const [slotA, slotB] = weaponSlots
    useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'No Aggregation Test',
      startingState: 'EXISTING',
      existingBuildId: buildId,
      targetOverrides: {
        [slotA.slotLabel]: { targetItem: LEFT_WEAPON_A, targetEntityClass: 'AMRS_LaserCannon_S3' },
        [slotB.slotLabel]: { targetItem: RIGHT_WEAPON_B, targetEntityClass: 'APAR_BallisticScatterGun_S3' },
      },
      setActive: false,
      saveAsNew: false,
    })

    const prepared = prepareCanonicalHardpoints('ghost', useFleetStore.getState().hardpoints.filter((h) => h.buildId === buildId), useFleetStore.getState().fleetAssets) as DisplayHardpoint[]
    const tree = buildPortTree(prepared)
    const aggregated = withMissileRackAggregation<DisplayHardpoint>(tree, (h) => h.targetItem, makeMissileAggregateRow)

    function flatten(nodes: typeof aggregated): DisplayHardpoint[] {
      return nodes.flatMap((n) => [n.hardpoint, ...flatten(n.children)])
    }
    const flat = flatten(aggregated)
    const weaponRows = flat.filter((h) => h.parentSlotLabel?.includes('Center'))
    // Both weapon children survive as SEPARATE rows — no "-missile-aggregate" collapse.
    expect(weaponRows.some((h) => h.slotLabel === slotA.slotLabel)).toBe(true)
    expect(weaponRows.some((h) => h.slotLabel === slotB.slotLabel)).toBe(true)
    expect(weaponRows.some((h) => h.id.endsWith('-missile-aggregate'))).toBe(false)
  })
})

describe('SW-013C.2C (Objective 6): payload-array behavior remains unchanged', () => {
  it('a missile rack still aggregates and still restarts its children empty on a genuine swap — the pre-existing, unmodified precedent', () => {
    const rackRow = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-stealth' && h.sourceItemPortName === 'hardpoint_missile_rack_right')!
    const spec = componentOwnedChildSlotSpec(rackRow.factoryEntityClass)
    expect(spec?.mode).toBe('payload-array')
    // (Full missile-rack swap/aggregation behavior already has its own
    // dedicated, extensive regression coverage — src/pages/__tests__/
    // MissionComposer.test.tsx's FTB-001B/EWO-054/EWO-054A suites — this
    // test only pins the mode classification itself stayed unchanged.)
  })
})

describe('SW-013C.2C (Objective 6): parent replacement preserves only authoritatively-corresponding children', () => {
  it('swapping between two turret variants with an incompatible weapon-slot size does NOT carry over the prior target (diagnosed as orphaned, never guessed)', () => {
    const { buildId: firstBuildId, weaponSlots } = swapCenterToBallTurret(BALL_TURRET)
    const [slotA] = weaponSlots
    useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Orphan Test',
      startingState: 'EXISTING',
      existingBuildId: firstBuildId,
      targetOverrides: { [slotA.slotLabel]: { targetItem: LEFT_WEAPON_A, targetEntityClass: 'AMRS_LaserCannon_S3' } },
      setActive: false,
      saveAsNew: false,
    })

    // Now swap the SAME build's Center to the Bespoke variant (confirmed S4, vs the original S3 — an incompatible size at the same position).
    const centerSlotLabel = useFleetStore.getState().hardpoints.find((h) => h.buildId === firstBuildId && h.sourceItemPortName === 'hardpoint_weapon_center')!.slotLabel
    const swapResult = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Orphan Test',
      startingState: 'EXISTING',
      existingBuildId: firstBuildId,
      targetOverrides: { [centerSlotLabel]: { targetItem: 'TMSB-5 Ball Turret', targetEntityClass: BALL_TURRET_BESPOKE } },
      setActive: false,
      saveAsNew: false,
    })
    expect(swapResult.success).toBe(true)

    const newWeaponSlots = useFleetStore
      .getState()
      .hardpoints.filter((h) => h.buildId === firstBuildId && h.parentSlotLabel === centerSlotLabel)
    expect(newWeaponSlots).toHaveLength(2)
    expect(newWeaponSlots[0].size).toBe('S4') // the Bespoke variant's real, different size
    // Never migrated merely because a position number matches — incompatible size, so it starts empty.
    expect(newWeaponSlots.every((s) => s.targetItem === '—')).toBe(true)
  })

  it('re-saving the SAME already-swapped turret preserves the Commander\'s own prior weapon selections (no re-wipe on every save)', () => {
    const { buildId, weaponSlots } = swapCenterToBallTurret()
    const [slotA, slotB] = weaponSlots
    useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Stability Test',
      startingState: 'EXISTING',
      existingBuildId: buildId,
      targetOverrides: {
        [slotA.slotLabel]: { targetItem: LEFT_WEAPON_A, targetEntityClass: 'AMRS_LaserCannon_S3' },
        [slotB.slotLabel]: { targetItem: RIGHT_WEAPON_B, targetEntityClass: 'APAR_BallisticScatterGun_S3' },
      },
      setActive: false,
      saveAsNew: false,
    })

    // A second, unrelated save on the same build (e.g. renaming) must not silently re-wipe the weapon children.
    const second = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Stability Test Renamed',
      startingState: 'EXISTING',
      existingBuildId: buildId,
      targetOverrides: {},
      setActive: false,
      saveAsNew: false,
    })
    expect(second.success).toBe(true)
    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === buildId)
    expect(rows.find((h) => h.slotLabel === slotA.slotLabel)?.targetItem).toBe(LEFT_WEAPON_A)
    expect(rows.find((h) => h.slotLabel === slotB.slotLabel)?.targetItem).toBe(RIGHT_WEAPON_B)
  })
})

describe('SW-013C.2C (Objective 8): no inventory/installed-state mutation from independent weapon target selection', () => {
  it('targeting a weapon child does not create Hangar Inventory or fabricate an installed component', () => {
    const before = useFleetStore.getState().hangarItems
    const installedBefore = useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')
    const { buildId, weaponSlots } = swapCenterToBallTurret()
    useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Inventory Isolation Test',
      startingState: 'EXISTING',
      existingBuildId: buildId,
      targetOverrides: { [weaponSlots[0].slotLabel]: { targetItem: LEFT_WEAPON_A, targetEntityClass: 'AMRS_LaserCannon_S3' } },
      setActive: false,
      saveAsNew: false,
    })
    expect(useFleetStore.getState().hangarItems).toEqual(before)
    expect(useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')).toEqual(installedBefore)
  })
})
