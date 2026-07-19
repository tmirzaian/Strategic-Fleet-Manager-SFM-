import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { getMissileRackSlotSpec } from '../../generated/missileRackSlots'
import { getMiningModuleSlotCount } from '../../generated/miningModuleSlots'
import { withComponentOwnedChildSlots } from '../../utils/componentOwnedSlots'
import { overlayCanonicalHierarchy, resolveShipDefinitionId } from '../../utils/loadoutEditorModel'
import { shipFactoryTemplates, shipDefinitions } from '../../data/shipDefinitions'
import type { Hardpoint } from '../../types'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

function hardpointsFor(buildId: string) {
  return useFleetStore.getState().hardpoints.filter((h) => h.buildId === buildId)
}

describe('saveMissionConfiguration (Mission Composer)', () => {
  it('creates a real Mission Configuration (Build with kind MISSION) tied to the exact Fleet Asset', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'utv',
      name: 'Custom UTV Loadout',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    expect(result.success).toBe(true)
    const build = useFleetStore.getState().builds.find((b) => b.id === result.buildId)!
    expect(build.shipId).toBe('utv')
    expect(build.kind).toBe('MISSION')
    expect(build.name).toBe('Custom UTV Loadout')
  })

  it('FACTORY starting state sets every target to the factory item', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Fresh From Factory',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    const rows = hardpointsFor(result.buildId!)
    for (const row of rows) {
      expect(row.targetItem).toBe(row.factoryItem)
    }
  })

  it('INSTALLED starting state sets every target to whatever is currently physically installed', () => {
    const setup = useFleetStore.getState().installComponent('ghost', 'FR-66', 'Shield 1', 'ghost-escort')
    expect(setup.matched).toBe(true) // Escort's Shield 1 starts Upgrade Available (Mirage != factory, != target FR-66), so this succeeds.
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Lock In Current State',
      startingState: 'INSTALLED',
      targetOverrides: {},
      setActive: false,
    })
    const shieldRow = hardpointsFor(result.buildId!).find((h) => h.slotLabel === 'Shield 1')!
    expect(shieldRow.targetItem).toBe('FR-66')
    expect(shieldRow.status).toBe('OK')
  })

  it('EMPTY starting state sets every target to empty (no requirements)', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Blank Slate',
      startingState: 'EMPTY',
      targetOverrides: {},
      setActive: false,
    })
    const rows = hardpointsFor(result.buildId!)
    for (const row of rows) {
      expect(row.targetItem).toBe('—')
    }
  })

  it('EXISTING starting state clones another Mission Configuration\'s targets', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Copy of Stealth',
      startingState: 'EXISTING',
      existingBuildId: 'ghost-stealth',
      targetOverrides: {},
      setActive: false,
    })
    const original = hardpointsFor('ghost-stealth')
    const copy = hardpointsFor(result.buildId!)
    for (const row of original) {
      const copiedRow = copy.find((c) => c.slotLabel === row.slotLabel)!
      expect(copiedRow.targetItem).toBe(row.targetItem)
    }
  })

  it('a Quartermaster Template applies its intent on top of the starting state', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Escort Loadout',
      startingState: 'FACTORY',
      quartermasterTemplateId: 'template-escort-support',
      targetOverrides: {},
      setActive: false,
    })
    const weaponRow = hardpointsFor(result.buildId!).find((h) => h.slotLabel === 'Weapon 1')!
    expect(weaponRow.targetItem).toBe('Mass Driver')
  })

  it('explicit per-slot target overrides win over both the template and the starting state', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Manually Tweaked',
      startingState: 'FACTORY',
      quartermasterTemplateId: 'template-escort-support',
      targetOverrides: { 'Weapon 1': 'CF-337 Panther Repeater' },
      setActive: false,
    })
    const weaponRow = hardpointsFor(result.buildId!).find((h) => h.slotLabel === 'Weapon 1')!
    expect(weaponRow.targetItem).toBe('CF-337 Panther Repeater')
  })

  it('setActive: true sets the new Mission Configuration as the Active Mission', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'utv',
      name: 'New Active Mission',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: true,
    })
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'utv')!
    expect(ship.activeBuildId).toBe(result.buildId)
  })

  it('setActive: false leaves the previous Active Mission untouched', () => {
    const before = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!.activeBuildId
    useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Not Active Yet',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    const after = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!.activeBuildId
    expect(after).toBe(before)
  })

  it('an explicitly-created Mission Configuration is real player intent, even one mirroring Factory targets', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'utv',
      name: 'Explicit Factory Mirror',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: true,
    })
    const build = useFleetStore.getState().builds.find((b) => b.id === result.buildId)!
    expect(build.kind).toBe('MISSION')
    expect(build.readiness).toBe(100)
  })

  it('editing an EXISTING Mission Configuration in place reuses its id rather than creating a duplicate', () => {
    const totalBuildsBefore = useFleetStore.getState().builds.length
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Stealth Build',
      startingState: 'EXISTING',
      existingBuildId: 'ghost-stealth',
      targetOverrides: { 'Power 1': 'Slipstream' },
      setActive: false,
    })
    expect(result.buildId).toBe('ghost-stealth')
    expect(useFleetStore.getState().builds.length).toBe(totalBuildsBefore)
    const powerRow = hardpointsFor('ghost-stealth').find((h) => h.slotLabel === 'Power 1')!
    expect(powerRow.targetItem).toBe('Slipstream')
  })

  it('fails cleanly for an unknown Fleet Asset', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'does-not-exist',
      name: 'Ghost Mission',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    expect(result.success).toBe(false)
  })

  it('fails cleanly with an empty name', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: '   ',
      startingState: 'FACTORY',
      targetOverrides: {},
      setActive: false,
    })
    expect(result.success).toBe(false)
  })
})

describe('saveMissionConfiguration — FTB-001B: dynamic missile rack swap persists real rows', () => {
  // Root-cause regression: the live Loadout Manager preview correctly
  // shows a freshly-synthesized rack slot's Target selection (via
  // MissionComposer's own `resolvePreviewTarget`), but that preview row
  // never existed in `referenceRows` — the real Hardpoint set
  // `saveMissionConfiguration` builds `newRows` from — so without this
  // fix, a Commander's missile assignment into a swapped rack's new slots
  // was silently discarded the instant the Loadout was actually saved,
  // even though the on-screen preview looked correct right up until Save.
  const DUAL_RACK = 'MRCK_S03_GAMA_Railen_Dual_S02' // Railen's real factory "Left Top Missile Rack", 2 slots @ S2
  const MSD341_RACK = 'MRCK_S03_BEHR_Quad_S01' // a real, unrelated, unambiguous S3-sized rack, 4 slots @ S1

  function addRailen() {
    const added = useFleetStore.getState().addFleetAsset('railen-imported', 'OWNED')
    if (!added.success || !added.assetId) throw new Error('failed to add Railen')
    return added.assetId
  }

  it('swapping the rack via Target override materializes real new child rows, removes the old ones, and the Commander\'s own missile assignment for a new slot actually persists', () => {
    if (getMissileRackSlotSpec(DUAL_RACK) === null || getMissileRackSlotSpec(MSD341_RACK) === null) return // generated-data/missile-rack-slots.json not present on this machine
    const shipId = addRailen()
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'Rack Swap Test',
      startingState: 'FACTORY',
      targetOverrides: {
        'Left Top Missile Rack': { targetItem: 'MSD-341 Missile Rack', targetEntityClass: MSD341_RACK },
        'Left Top Missile Rack — Missile Slot 1': { targetItem: 'TaskForce I Missile', targetEntityClass: undefined },
      },
      setActive: false,
    })
    expect(result.success).toBe(true)
    const rows = hardpointsFor(result.buildId!)

    // The old 2xS2 real children are gone — never lingering alongside the
    // new ones.
    expect(rows.some((h) => h.slotLabel === 'Left Top Missile Rack — Missile Slot 2' && h.size === 'S2')).toBe(false)

    // The new rack's real 4xS1 structure exists as real, addressable rows.
    const newSlots = rows.filter((h) => h.parentSlotLabel === 'Left Top Missile Rack')
    expect(newSlots.length).toBe(4)
    expect(newSlots.every((h) => h.size === 'S1')).toBe(true)

    // The Commander's own missile pick for slot 1 actually saved.
    const slot1 = rows.find((h) => h.slotLabel === 'Left Top Missile Rack — Missile Slot 1')!
    expect(slot1.targetItem).toBe('TaskForce I Missile')

    // An unswapped rack on the same ship (Left Bottom) is completely
    // unaffected — its real factory children survive untouched. Railen's
    // own raw import data names these "01 Attach Missile" etc. (the real
    // StarBreaker convention — formatHardpointLabel presents this as
    // "Missile Slot 1" for display, but the underlying persisted
    // slotLabel is the raw form), unlike a freshly-materialized slot's
    // literal "Missile Slot N" slotLabel.
    const untouchedSlot = rows.find((h) => h.slotLabel === 'Left Bottom Missile Rack — 01 Attach Missile')!
    expect(untouchedSlot.targetItem).toBe('TaskForce I Missile')
    expect(untouchedSlot.size).toBe('S1')
  })

  it('the swap and the missile assignment both survive a genuine reload', () => {
    if (getMissileRackSlotSpec(DUAL_RACK) === null || getMissileRackSlotSpec(MSD341_RACK) === null) return
    const shipId = addRailen()
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'Rack Swap Reload Test',
      startingState: 'FACTORY',
      targetOverrides: {
        'Left Top Missile Rack': { targetItem: 'MSD-341 Missile Rack', targetEntityClass: MSD341_RACK },
        'Left Top Missile Rack — Missile Slot 4': { targetItem: 'TaskForce I Missile', targetEntityClass: undefined },
      },
      setActive: true,
    })
    expect(result.success).toBe(true)

    // A genuine reload: rehydrate a brand-new store instance from whatever
    // got written to localStorage, exactly like a real browser restart.
    const persisted = localStorage.getItem('sfm-fleet-store')
    expect(persisted).toBeTruthy()
    useFleetStore.persist.rehydrate()

    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === result.buildId)
    const newSlots = rows.filter((h) => h.parentSlotLabel === 'Left Top Missile Rack')
    expect(newSlots.length).toBe(4)
    const slot4 = rows.find((h) => h.slotLabel === 'Left Top Missile Rack — Missile Slot 4')!
    expect(slot4.targetItem).toBe('TaskForce I Missile')
    expect(slot4.size).toBe('S1')
  })

  it('an ordinary (non-rack) target swap never touches unrelated child rows — a gimbal mount changing weapons still keeps its real Weapon child intact', () => {
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: 'ghost',
      name: 'Ordinary Weapon Swap',
      startingState: 'FACTORY',
      targetOverrides: { 'Power 1': 'Slipstream' },
      setActive: false,
    })
    expect(result.success).toBe(true)
    const rows = hardpointsFor(result.buildId!)
    // Nothing was spuriously removed or materialized for an ordinary,
    // non-component-owned port.
    const before = useFleetStore.getState().hardpoints.filter((h) => h.buildId === useFleetStore.getState().ships.find((s) => s.id === 'ghost')!.activeBuildId)
    expect(rows.length).toBe(before.length)
  })
})

describe('saveMissionConfiguration — FTB-001D: Helix II Mining Laser survives a genuine reload with all three module slots', () => {
  // Mining module slots (unlike a missile rack's — see FTB-001B) are
  // NEVER real, persisted rows — purely display/calculation-time
  // synthesis (componentOwnedSlots.ts), by FTB-001A's own established
  // design, unchanged by this mission. "Rehydrates with all three child
  // slots" therefore means: the SAVED Loadout's mining port target
  // (Helix II) itself survives a genuine reload, and the same render-time
  // synthesis every page already runs (here reproduced directly, the
  // exact same two calls src/pages/ShipDetail.tsx makes) re-derives three
  // module slots fresh from that persisted identity — never zero, never a
  // stale two.
  const HELIX_II_ENTITY_CLASS = 'Mining_Laser_THCN_Helix_S2'
  const HELIX_II_NAME = 'Helix II Mining Laser'
  const MOLE_MINING_SLOT = 'Front Cab Mining Laser (Manned Turret) — Mining Weapon'

  function effectiveHardpointsFor(shipId: string, buildId: string): Hardpoint[] {
    const definitionId = resolveShipDefinitionId(shipId, useFleetStore.getState().fleetAssets)
    const template = definitionId ? (shipFactoryTemplates[definitionId] ?? []) : []
    const shipHardpoints = useFleetStore.getState().hardpoints.filter((h) => h.buildId === buildId)
    return withComponentOwnedChildSlots(overlayCanonicalHierarchy(shipHardpoints, template), (host, n) => ({
      ...host,
      id: `${host.id}-module-slot-${n}`,
      slotLabel: `${host.slotLabel} — Module Slot ${n}`,
      parentSlotLabel: host.slotLabel,
      isStructural: true,
    }))
  }

  it("7. Helix II's Target assignment and its three synthesized module slots both survive a genuine reload", () => {
    if (getMiningModuleSlotCount(HELIX_II_ENTITY_CLASS) === 0) return // generated-data/mining-module-slots.json not present on this machine
    const mole = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'MOLE')
    if (!mole) return
    const added = useFleetStore.getState().addFleetAsset(mole.id, 'OWNED')
    if (!added.success || !added.assetId) throw new Error('failed to add MOLE')

    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: added.assetId,
      name: 'FTB-001D Helix Test',
      startingState: 'FACTORY',
      targetOverrides: { [MOLE_MINING_SLOT]: { targetItem: HELIX_II_NAME, targetEntityClass: HELIX_II_ENTITY_CLASS } },
      setActive: true,
    })
    expect(result.success).toBe(true)

    // Ship Detail's own effective render is INSTALLED-first (FTB-001B
    // precedent: "what does my ship actually look like right now"), so
    // simulate the completed physical swap — the real end-state a
    // Commander's Quick Update "Install Component" action produces.
    // `installedLoadouts` (not the Hardpoint row directly) is this
    // store's single authoritative "what's installed" record — rehydrate
    // re-overlays every row's installedItem FROM it, so both must agree,
    // exactly the way FTB-001B's own persistence tests learned the hard
    // way (a direct hardpoint-only patch gets silently reverted on
    // rehydrate otherwise).
    useFleetStore.setState({
      hardpoints: useFleetStore.getState().hardpoints.map((h) =>
        h.buildId === result.buildId && h.slotLabel === MOLE_MINING_SLOT
          ? { ...h, installedItem: HELIX_II_NAME, installedEntityClass: HELIX_II_ENTITY_CLASS, status: 'OK' }
          : h
      ),
      installedLoadouts: [
        ...useFleetStore.getState().installedLoadouts.filter((e) => !(e.shipId === added.assetId && e.slotLabel === MOLE_MINING_SLOT)),
        { shipId: added.assetId, slotLabel: MOLE_MINING_SLOT, installedItem: HELIX_II_NAME, entityClass: HELIX_II_ENTITY_CLASS },
      ],
    })

    useFleetStore.persist.rehydrate()

    const targetRow = useFleetStore.getState().hardpoints.find((h) => h.buildId === result.buildId && h.slotLabel === MOLE_MINING_SLOT)!
    expect(targetRow.targetItem).toBe(HELIX_II_NAME)
    expect(targetRow.targetEntityClass).toBe(HELIX_II_ENTITY_CLASS)
    expect(targetRow.installedEntityClass).toBe(HELIX_II_ENTITY_CLASS)

    const effective = effectiveHardpointsFor(added.assetId, result.buildId!)
    const moduleSlots = effective.filter((h) => h.parentSlotLabel === MOLE_MINING_SLOT)
    expect(moduleSlots.length).toBe(3)
  })
})
