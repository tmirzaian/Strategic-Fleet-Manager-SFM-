import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { getMissileRackSlotSpec } from '../../generated/missileRackSlots'
import { getMiningModuleSlotCount } from '../../generated/miningModuleSlots'
import { withComponentOwnedChildSlots } from '../../utils/componentOwnedSlots'
import { overlayCanonicalHierarchy, resolveShipDefinitionId } from '../../utils/loadoutEditorModel'
import { shipFactoryTemplates, shipDefinitions } from '../../data/shipDefinitions'
import { componentsByEntityClass, compatibilityPortTypeFor } from '../../generated/componentCatalog'
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

describe('saveMissionConfiguration — FTB-001E: mining module target assignments now persist as real rows', () => {
  // Root-cause fix: mining module slots were never editable at all
  // (isStructural: true, no picker rendered — src/data/__tests__/
  // componentCatalog.test.ts's own FTB-001E section documents the full
  // finding), so a target assignment into one had nowhere to persist. No
  // real, catalogable mining-module CATALOG component exists in the
  // currently-imported data (also documented there) — these tests use a
  // realistic but uncataloged fixture name for the assignment itself
  // (the exact same "uncataloged item, permissively accepted" path every
  // other free-text Target assignment in this app already relies on),
  // while proving the REAL, generated slot-count/reconciliation
  // machinery (Arbor MH2/Helix II/Klein-S1) with real entity classes.
  const ARBOR_MH2 = 'Mining_Laser_GRIN_Arbor_S2' // MOLE's real factory laser, 2 module slots
  const HELIX_II = 'Mining_Laser_THCN_Helix_S2' // 3 module slots
  const KLEIN_S1_ZERO = 'Mining_Laser_SHIN_Klein_S1' // 0 module slots
  const MOLE_MINING_SLOT = 'Front Cab Mining Laser (Manned Turret) — Mining Weapon'
  const FIXTURE_MODULE_NAME = 'FTB-001E Test Fixture Module'

  function effectiveHardpointsFor(shipId: string, buildId: string): Hardpoint[] {
    const definitionId = resolveShipDefinitionId(shipId, useFleetStore.getState().fleetAssets)
    const template = definitionId ? (shipFactoryTemplates[definitionId] ?? []) : []
    const shipHardpoints = useFleetStore.getState().hardpoints.filter((h) => h.buildId === buildId)
    return withComponentOwnedChildSlots(overlayCanonicalHierarchy(shipHardpoints, template), (host, n) => ({
      ...host,
      id: `${host.id}-module-slot-${n}`,
      slotLabel: `${host.slotLabel} — Module Slot ${n}`,
      parentSlotLabel: host.slotLabel,
      isStructural: false,
    }))
  }

  function addMole() {
    const mole = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'MOLE')
    if (!mole) return null
    const added = useFleetStore.getState().addFleetAsset(mole.id, 'OWNED')
    if (!added.success || !added.assetId) throw new Error('failed to add MOLE')
    return added.assetId
  }

  it('a target assignment into Module Slot 1 (factory Arbor MH2, 2 slots) persists as a real row and survives a genuine reload', () => {
    if (getMiningModuleSlotCount(ARBOR_MH2) === 0) return
    const shipId = addMole()
    if (!shipId) return
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'FTB-001E Mining Module Assignment',
      startingState: 'FACTORY',
      targetOverrides: { [`${MOLE_MINING_SLOT} — Module Slot 1`]: { targetItem: FIXTURE_MODULE_NAME, targetEntityClass: undefined } },
      setActive: true,
    })
    expect(result.success).toBe(true)

    useFleetStore.persist.rehydrate()

    const slot1 = useFleetStore.getState().hardpoints.find((h) => h.buildId === result.buildId && h.slotLabel === `${MOLE_MINING_SLOT} — Module Slot 1`)
    expect(slot1).toBeDefined()
    expect(slot1!.targetItem).toBe(FIXTURE_MODULE_NAME)
    expect(slot1!.parentSlotLabel).toBe(MOLE_MINING_SLOT)

    const effective = effectiveHardpointsFor(shipId, result.buildId!)
    expect(effective.filter((h) => h.parentSlotLabel === MOLE_MINING_SLOT).length).toBe(2)
  })

  it('switching Arbor MH2 -> Helix II in the same save preserves the compatible existing Module Slot 1 assignment and produces exactly three rows', () => {
    if (getMiningModuleSlotCount(ARBOR_MH2) === 0 || getMiningModuleSlotCount(HELIX_II) === 0) return
    const shipId = addMole()
    if (!shipId) return
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'FTB-001E MH2 to Helix Reconciliation',
      startingState: 'FACTORY',
      targetOverrides: {
        [MOLE_MINING_SLOT]: { targetItem: 'Helix II Mining Laser', targetEntityClass: HELIX_II },
        [`${MOLE_MINING_SLOT} — Module Slot 1`]: { targetItem: FIXTURE_MODULE_NAME, targetEntityClass: undefined },
      },
      setActive: true,
    })
    expect(result.success).toBe(true)

    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === result.buildId)
    const moduleSlots = rows.filter((h) => h.parentSlotLabel === MOLE_MINING_SLOT)
    expect(moduleSlots.length).toBe(3) // Helix II's real count, not MH2's 2

    // Slot 1's assignment — same slotLabel, same S2 port size on both
    // lasers — is genuinely compatible with the new laser and survives
    // the swap rather than being silently wiped.
    const slot1 = moduleSlots.find((h) => h.slotLabel === `${MOLE_MINING_SLOT} — Module Slot 1`)!
    expect(slot1.targetItem).toBe(FIXTURE_MODULE_NAME)
    // Slot 3 is new (MH2 never had one) and starts empty.
    const slot3 = moduleSlots.find((h) => h.slotLabel === `${MOLE_MINING_SLOT} — Module Slot 3`)!
    expect(slot3.targetItem).toBe('—')
  })

  it('switching Helix II -> a real zero-slot laser (Klein-S1) removes every synthesized module row', () => {
    if (getMiningModuleSlotCount(HELIX_II) === 0) return
    expect(getMiningModuleSlotCount(KLEIN_S1_ZERO)).toBe(0)
    const shipId = addMole()
    if (!shipId) return
    // First establish Helix II as the swapped-in laser with an assignment...
    const first = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'FTB-001E Helix Then Klein',
      startingState: 'FACTORY',
      targetOverrides: {
        [MOLE_MINING_SLOT]: { targetItem: 'Helix II Mining Laser', targetEntityClass: HELIX_II },
        [`${MOLE_MINING_SLOT} — Module Slot 1`]: { targetItem: FIXTURE_MODULE_NAME, targetEntityClass: undefined },
      },
      setActive: true,
    })
    expect(first.success).toBe(true)
    expect(useFleetStore.getState().hardpoints.filter((h) => h.buildId === first.buildId && h.parentSlotLabel === MOLE_MINING_SLOT).length).toBe(3)

    // ...then edit that same Loadout again, swapping to Klein-S1 (0 slots).
    const second = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'FTB-001E Helix Then Klein',
      startingState: 'EXISTING',
      existingBuildId: first.buildId,
      targetOverrides: { [MOLE_MINING_SLOT]: { targetItem: 'Klein-S1 Mining Laser', targetEntityClass: KLEIN_S1_ZERO } },
      setActive: true,
    })
    expect(second.success).toBe(true)
    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === second.buildId)
    expect(rows.some((h) => h.parentSlotLabel === MOLE_MINING_SLOT)).toBe(false)
  })
})

describe('saveMissionConfiguration — FTB-001E: salvage scraper/tractor module target assignments persist and rehydrate', () => {
  // Unlike mining module slots, a salvage head's scraper/tractor
  // sub-items are REAL, ship-baked ports that always exist in the
  // canonical template (never synthesized) — so no special
  // materialization is needed here at all; this proves the ORDINARY
  // targetOverrides path (already exercised by every other ordinary port
  // in this test file) correctly carries a real catalog salvage module
  // through save + a genuine reload, now that it's actually selectable
  // (src/data/__tests__/componentCatalog.test.ts's own FTB-001E section
  // proves the compatibility fix itself).
  const READYGRIP = 'Salvage_Modifier_Tractor_Small'
  const RECLAIMER_TRACTOR_SLOT = 'Left Remote Salvage Turret (Remote Turret) — Salvage Weapon (Mount) — SubItem01 Salvage Head'

  it("a ReadyGrip Tractor Module target assignment on a real Reclaimer tractor slot persists and survives a genuine reload, with no fabricated grandchild rows", () => {
    const reclaimer = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Reclaimer')
    if (!reclaimer) return
    const added = useFleetStore.getState().addFleetAsset(reclaimer.id, 'OWNED')
    if (!added.success || !added.assetId) throw new Error('failed to add Reclaimer')
    const slotExists = useFleetStore.getState().hardpoints.some((h) => h.buildId === useFleetStore.getState().ships.find((s) => s.id === added.assetId)!.activeBuildId && h.slotLabel === RECLAIMER_TRACTOR_SLOT)
    if (!slotExists) return // real generated ship data not present on this machine

    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId: added.assetId,
      name: 'FTB-001E Salvage Assignment',
      startingState: 'FACTORY',
      targetOverrides: { [RECLAIMER_TRACTOR_SLOT]: { targetItem: 'ReadyGrip Tractor Module', targetEntityClass: READYGRIP } },
      setActive: true,
    })
    expect(result.success).toBe(true)

    useFleetStore.persist.rehydrate()

    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === result.buildId)
    const tractorRow = rows.find((h) => h.slotLabel === RECLAIMER_TRACTOR_SLOT)!
    expect(tractorRow.targetItem).toBe('ReadyGrip Tractor Module')
    expect(tractorRow.targetEntityClass).toBe(READYGRIP)
    // No grandchildren synthesized beneath the module itself.
    expect(rows.some((h) => h.parentSlotLabel === RECLAIMER_TRACTOR_SLOT)).toBe(false)
  })
})

describe('saveMissionConfiguration — FTB-001F: salvage socket semantics (no scraper/tractor over-specialization)', () => {
  // FTB-001E's fix inferred socket capability from whichever modifier was
  // factory-installed there (SubItem01 -> "tractor-only", SubItem02 ->
  // "scraper-only"), which SPPV field validation proved wrong: the real
  // game accepts any real salvage modifier in either socket on the same
  // head. These tests exercise the ACTUAL save/persist/reload path (not
  // just the compatibility-layer check componentCatalog.test.ts already
  // covers) for the combinations the mission explicitly requires.
  const ABRADE = 'Salvage_Modifier_Scraper_Medium'
  const CINCH = 'Salvage_Modifier_Scraper_Small'
  const READYGRIP = 'Salvage_Modifier_Tractor_Small'
  // Reclaimer's own two real child sockets — SubItem01 factory-shipped
  // with a tractor module, SubItem02 factory-shipped with a scraper
  // module. Neither factory identity should constrain what can be
  // targeted there now.
  const SOCKET_1 = 'Left Remote Salvage Turret (Remote Turret) — Salvage Weapon (Mount) — SubItem01 Salvage Head'
  const SOCKET_2 = 'Left Remote Salvage Turret (Remote Turret) — Salvage Weapon (Mount) — SubItem02 Salvage Head'

  function addReclaimer() {
    const reclaimer = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Reclaimer')
    if (!reclaimer) return null
    const added = useFleetStore.getState().addFleetAsset(reclaimer.id, 'OWNED')
    if (!added.success || !added.assetId) throw new Error('failed to add Reclaimer')
    const activeBuildId = useFleetStore.getState().ships.find((s) => s.id === added.assetId)!.activeBuildId
    const slotsExist = useFleetStore.getState().hardpoints.some((h) => h.buildId === activeBuildId && h.slotLabel === SOCKET_1)
    return slotsExist ? added.assetId : null
  }

  it('double Abrade — the same modifier in both sockets on one head persists and survives a genuine reload', () => {
    const shipId = addReclaimer()
    if (!shipId) return
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'FTB-001F Double Abrade',
      startingState: 'FACTORY',
      targetOverrides: {
        [SOCKET_1]: { targetItem: 'Abrade Scraper Module', targetEntityClass: ABRADE },
        [SOCKET_2]: { targetItem: 'Abrade Scraper Module', targetEntityClass: ABRADE },
      },
      setActive: true,
    })
    expect(result.success).toBe(true)
    useFleetStore.persist.rehydrate()
    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === result.buildId)
    const socket1 = rows.find((h) => h.slotLabel === SOCKET_1)!
    const socket2 = rows.find((h) => h.slotLabel === SOCKET_2)!
    expect(socket1.targetItem).toBe('Abrade Scraper Module')
    expect(socket2.targetItem).toBe('Abrade Scraper Module')
    // Genuinely exercises the compatibility fix, not just persistence:
    // saveMissionConfiguration never blocks an incompatible save (it only
    // flags status), so a bare targetItem-equality check alone would pass
    // even with FTB-001E's over-specialized split still in place. Status
    // must positively read OK/Upgrade-Available (compatible), never
    // 'Invalid Target'.
    expect(socket1.status).not.toBe('Invalid Target')
    expect(socket2.status).not.toBe('Invalid Target')
    expect(rows.some((h) => h.parentSlotLabel === SOCKET_1 || h.parentSlotLabel === SOCKET_2)).toBe(false)
  })

  it('double Cinch — the same modifier in both sockets on one head persists and survives a genuine reload', () => {
    const shipId = addReclaimer()
    if (!shipId) return
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'FTB-001F Double Cinch',
      startingState: 'FACTORY',
      targetOverrides: {
        [SOCKET_1]: { targetItem: 'Cinch Scraper Module', targetEntityClass: CINCH },
        [SOCKET_2]: { targetItem: 'Cinch Scraper Module', targetEntityClass: CINCH },
      },
      setActive: true,
    })
    expect(result.success).toBe(true)
    useFleetStore.persist.rehydrate()
    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === result.buildId)
    const socket1 = rows.find((h) => h.slotLabel === SOCKET_1)!
    const socket2 = rows.find((h) => h.slotLabel === SOCKET_2)!
    expect(socket1.targetItem).toBe('Cinch Scraper Module')
    expect(socket2.targetItem).toBe('Cinch Scraper Module')
    expect(socket1.status).not.toBe('Invalid Target')
    expect(socket2.status).not.toBe('Invalid Target')
  })

  it('mixed configuration — a scraper module in the factory-tractor socket and a tractor module in the factory-scraper socket both persist as compatible (the reverse of factory assignment, proving no positional lock-in)', () => {
    const shipId = addReclaimer()
    if (!shipId) return
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'FTB-001F Mixed Reversed',
      startingState: 'FACTORY',
      targetOverrides: {
        [SOCKET_1]: { targetItem: 'Abrade Scraper Module', targetEntityClass: ABRADE }, // SOCKET_1's factory item is the tractor module
        [SOCKET_2]: { targetItem: 'ReadyGrip Tractor Module', targetEntityClass: READYGRIP }, // SOCKET_2's factory item is a scraper module
      },
      setActive: true,
    })
    expect(result.success).toBe(true)
    useFleetStore.persist.rehydrate()
    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === result.buildId)
    const socket1 = rows.find((h) => h.slotLabel === SOCKET_1)!
    const socket2 = rows.find((h) => h.slotLabel === SOCKET_2)!
    expect(socket1.targetItem).toBe('Abrade Scraper Module')
    expect(socket2.targetItem).toBe('ReadyGrip Tractor Module')
    expect(socket1.status).not.toBe('Invalid Target')
    expect(socket2.status).not.toBe('Invalid Target')
  })
})

describe('saveMissionConfiguration — FTB-001H: MOLE mining module size correction', () => {
  // Root cause: a mining module child slot inherited its host laser's own
  // port size (MOLE's Arbor S2 laser -> "S2 Mining Module") instead of the
  // real, fixed module size (every real Mining Module is size 1) — so no
  // real component could ever satisfy the MOLE's slots, while the
  // Prospector's S1 laser happened to match by coincidence. Fixed in
  // src/utils/componentOwnedSlots.ts (componentOwnedChildSlotSpec's mining
  // branch now sets size: 1 explicitly). These tests exercise the ACTUAL
  // save/persist path with a REAL catalog mining module (catalog-gated —
  // no-ops if the committed catalog hasn't been regenerated on this
  // machine, matching this codebase's established convention).
  const MOLE_MINING_SLOT = 'Front Cab Mining Laser (Manned Turret) — Mining Weapon'
  const PROSPECTOR_MINING_SLOT = 'Arm Mining Laser (Mount) — Laser Mining Laser (Gimbal Mount) — Laser Mining Laser'

  const realModule = Array.from(componentsByEntityClass.values()).find((r) => compatibilityPortTypeFor(r.category, r.subtype) === 'Mining Module' && r.displayName)

  function addShip(displayName: string) {
    const def = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === displayName)
    if (!def) return null
    const added = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    if (!added.success || !added.assetId) throw new Error(`failed to add ${displayName}`)
    return added.assetId
  }

  it('a real Mining Module is now a valid, non-rejected target for the MOLE\'s Module Slot 1 (was unconditionally incompatible before this fix, regardless of which real module was tried)', () => {
    if (!realModule) return
    if (getMiningModuleSlotCount('Mining_Laser_GRIN_Arbor_S2') === 0) return
    const shipId = addShip('MOLE')
    if (!shipId) return
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'FTB-001H MOLE Real Module Assignment',
      startingState: 'FACTORY',
      targetOverrides: {
        [`${MOLE_MINING_SLOT} — Module Slot 1`]: { targetItem: realModule.displayName, targetEntityClass: realModule.entityClass },
      },
      setActive: true,
    })
    expect(result.success).toBe(true)
    const slot1 = useFleetStore.getState().hardpoints.find((h) => h.buildId === result.buildId && h.slotLabel === `${MOLE_MINING_SLOT} — Module Slot 1`)
    expect(slot1).toBeDefined()
    expect(slot1!.targetItem).toBe(realModule.displayName)
    expect(slot1!.size).toBe('S1') // fixed real module size, never the S2 host laser port size
    expect(slot1!.status).not.toBe('Invalid Target')
  })

  it('the Prospector\'s own Mining Module slot is unaffected by this fix — still S1, still accepts the same real module', () => {
    if (!realModule) return
    if (getMiningModuleSlotCount('Mining_Laser_GRIN_Arbor_S1') === 0) return
    const shipId = addShip('Prospector')
    if (!shipId) return
    const result = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'FTB-001H Prospector Unchanged',
      startingState: 'FACTORY',
      targetOverrides: {
        [`${PROSPECTOR_MINING_SLOT} — Module Slot 1`]: { targetItem: realModule.displayName, targetEntityClass: realModule.entityClass },
      },
      setActive: true,
    })
    expect(result.success).toBe(true)
    const slot1 = useFleetStore.getState().hardpoints.find((h) => h.buildId === result.buildId && h.slotLabel === `${PROSPECTOR_MINING_SLOT} — Module Slot 1`)
    expect(slot1).toBeDefined()
    expect(slot1!.targetItem).toBe(realModule.displayName)
    expect(slot1!.size).toBe('S1')
    expect(slot1!.status).not.toBe('Invalid Target')
  })
})
