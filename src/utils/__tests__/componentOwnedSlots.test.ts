import { describe, it, expect } from 'vitest'
import { componentOwnedChildSlotCount, componentOwnedChildSlotSpec, withComponentOwnedChildSlots, type ComponentOwnedSlotHost } from '../componentOwnedSlots'
import { getMiningModuleSlotCount } from '../../generated/miningModuleSlots'
import { getMissileRackSlotSpec } from '../../generated/missileRackSlots'

/**
 * FTB-001A (Workstream C) — root-cause investigation confirmed real,
 * source-derived Mining Module attachment points exist on a mining
 * laser's OWN DataCore record (`Components[].Ports[]`, tagged
 * `PortTags`/`RequiredPortTags` containing "miningConsumable") — never on
 * the ship, never a fixed per-size constant. See
 * scripts/generateMiningModuleSlots.ts for the full derivation and
 * generated-data/mining-module-slots.json for the committed result.
 * `Mining_Laser_GRIN_Arbor_S1` (Arbor MH1, 1 slot) and
 * `Mining_Laser_GRIN_Arbor_S2` (Arbor MH2, 2 slots) are real, genuinely
 * different counts for two same-manufacturer, adjacent-size heads;
 * `Mining_Laser_SHIN_Klein_S1` is a real, same-nominal-size head with
 * ZERO module slots — proof a per-size default would have been wrong.
 * Skips (never fails) when the generated file isn't present on this
 * machine, matching the convention every other generated-data-dependent
 * test in this codebase already uses.
 */
const ARBOR_MH1 = 'Mining_Laser_GRIN_Arbor_S1'
const ARBOR_MH2 = 'Mining_Laser_GRIN_Arbor_S2'
const KLEIN_S1_ZERO_SLOTS = 'Mining_Laser_SHIN_Klein_S1'
const hasMiningData = getMiningModuleSlotCount(ARBOR_MH2) > 0

describe('componentOwnedChildSlotCount — FTB-001A (Workstream C)', () => {
  it('Arbor MH1 and Arbor MH2 (real, adjacent-size mining heads) expose genuinely different real slot counts', () => {
    if (!hasMiningData) return
    expect(componentOwnedChildSlotCount(ARBOR_MH1)).toBe(1)
    expect(componentOwnedChildSlotCount(ARBOR_MH2)).toBe(2)
    expect(componentOwnedChildSlotCount(ARBOR_MH1)).not.toBe(componentOwnedChildSlotCount(ARBOR_MH2))
  })

  it('a real mining head confirmed to have zero module ports (Klein-S1) never fabricates a slot', () => {
    if (!hasMiningData) return
    expect(componentOwnedChildSlotCount(KLEIN_S1_ZERO_SLOTS)).toBe(0)
  })

  it('an uncataloged/unknown entityClass returns 0, never a guessed default', () => {
    expect(componentOwnedChildSlotCount('Some_Entirely_Unknown_Entity_Class')).toBe(0)
    expect(componentOwnedChildSlotCount(undefined)).toBe(0)
    expect(componentOwnedChildSlotCount(null)).toBe(0)
  })
})

function host(overrides: Partial<ComponentOwnedSlotHost> & Pick<ComponentOwnedSlotHost, 'id' | 'slotLabel'>): ComponentOwnedSlotHost {
  return { ...overrides }
}

describe('withComponentOwnedChildSlots — FTB-001A (Workstream C)', () => {
  it('appends one synthetic child row per real slot, derived from the CURRENTLY INSTALLED component identity', () => {
    if (!hasMiningData) return
    const rows = [host({ id: 'laser', slotLabel: 'Mining Laser', installedEntityClass: ARBOR_MH2 })]
    const result = withComponentOwnedChildSlots(rows, (h, n) => host({ id: `${h.id}-slot-${n}`, slotLabel: `${h.slotLabel} — Module Slot ${n}`, isStructural: true }))
    const slots = result.filter((r) => r.slotLabel.includes('Module Slot'))
    expect(slots.map((s) => s.slotLabel)).toEqual(['Mining Laser — Module Slot 1', 'Mining Laser — Module Slot 2'])
  })

  it('two different installed mining heads on the same row shape produce two different real slot counts (never a single hardcoded number)', () => {
    if (!hasMiningData) return
    const mh1Row = [host({ id: 'a', slotLabel: 'Arm A', installedEntityClass: ARBOR_MH1 })]
    const mh2Row = [host({ id: 'b', slotLabel: 'Arm B', installedEntityClass: ARBOR_MH2 })]
    const mh1Slots = withComponentOwnedChildSlots(mh1Row, (h, n) => host({ id: `${h.id}-${n}`, slotLabel: `slot-${n}` })).length - 1
    const mh2Slots = withComponentOwnedChildSlots(mh2Row, (h, n) => host({ id: `${h.id}-${n}`, slotLabel: `slot-${n}` })).length - 1
    expect(mh1Slots).toBe(1)
    expect(mh2Slots).toBe(2)
  })

  it('falls back to targetEntityClass, then factoryEntityClass, when nothing is installed — "what is actually there right now"', () => {
    if (!hasMiningData) return
    const targetOnly = [host({ id: 'a', slotLabel: 'A', targetEntityClass: ARBOR_MH2 })]
    expect(withComponentOwnedChildSlots(targetOnly, (h, n) => host({ id: `${h.id}-${n}`, slotLabel: `s${n}` })).length).toBe(3) // 1 original + 2 slots

    const factoryOnly = [host({ id: 'b', slotLabel: 'B', factoryEntityClass: ARBOR_MH1 })]
    expect(withComponentOwnedChildSlots(factoryOnly, (h, n) => host({ id: `${h.id}-${n}`, slotLabel: `s${n}` })).length).toBe(2) // 1 original + 1 slot
  })

  it('a structural row is never given synthetic child slots, even if it happens to carry a mining-head entityClass', () => {
    if (!hasMiningData) return
    const rows = [host({ id: 'a', slotLabel: 'A', isStructural: true, installedEntityClass: ARBOR_MH2 })]
    const result = withComponentOwnedChildSlots(rows, (h, n) => host({ id: `${h.id}-${n}`, slotLabel: `s${n}` }))
    expect(result).toEqual(rows)
  })

  it('a component that owns zero real slots appends nothing — the row list is returned exactly as given', () => {
    const rows = [host({ id: 'a', slotLabel: 'Ordinary Weapon', installedEntityClass: 'Some_Ordinary_Weapon_Entity' })]
    const result = withComponentOwnedChildSlots(rows, (h, n) => host({ id: `${h.id}-${n}`, slotLabel: `s${n}` }))
    expect(result).toBe(rows)
  })
})

/**
 * FTB-001B — root-cause investigation confirmed real, source-derived
 * missile attach points exist on a missile rack's OWN DataCore record
 * (`Components[].Ports[]`, `MinSize`/`MaxSize` uniform across every port
 * on that record) — never on the ship, never a fixed per-size or
 * per-display-name constant. See scripts/generateMissileRackSlots.ts for
 * the full derivation and generated-data/missile-rack-slots.json for the
 * committed result. Real rack families sampled: the Polaris's own S10
 * rack (8xS3), 325a/Starlancer's S4-S5 racks (4xS3), Talon's S4 rack
 * (12xS3), Asgard's S7 rack (16xS3), and single/dual BEHR racks at
 * S1/S2/S3 — confirming both count AND missile size genuinely vary per
 * rack, never a function of the rack's own overall size classification
 * alone.
 *
 * "MSD-543" and "MSD-683" are real, confirmed ambiguous display names:
 * two or more distinct entityClasses share each name with genuinely
 * different real slot counts (325a's MSD-543 = 4 slots; Asgard's
 * MSD-683 = 16 slots vs Talon's own MSD-683 = 12 slots) — exactly the
 * class of case canonical entityClass identity (never display-name
 * parsing) exists to resolve correctly.
 */
const POLARIS_RACK = 'MRCK_S10_RSI_Polaris_Right' // MSD-543-adjacent family — 8 slots @ S3
const TALON_MSD683 = 'MRCK_S04_ESPR_Talon' // "MSD-683 Missile Rack" — 12 slots @ S3
const ASGARD_MSD683 = 'MRCK_S07_ANVL_Asgard_16_S03' // "MSD-683 Missile Rack" — 16 slots @ S3 (same display name, different real count)
const RACK_325A_MSD543 = 'MRCK_S05_ORIG_325a_Quad_S03' // "MSD-543 Missile Rack" — 4 slots @ S3
const RACK_S01_SINGLE = 'MRCK_S01_BEHR_Single_S01' // 1 slot @ S1
const RACK_S02_SINGLE = 'MRCK_S02_BEHR_Single_S02' // 1 slot @ S2
const RACK_S03_SINGLE = 'MRCK_S03_BEHR_Single_S03' // 1 slot @ S3
const RACK_FURY_DUAL = 'MRCK_S02_MISC_Fury_Dual' // 2 slots @ S1
const hasRackData = getMissileRackSlotSpec(POLARIS_RACK) !== null

describe('componentOwnedChildSlotSpec — FTB-001B: missile racks', () => {
  it('the Polaris rack, a Talon rack, and an Asgard rack (three real families) each expose genuinely different real slot counts, all at the same real missile size', () => {
    if (!hasRackData) return
    expect(componentOwnedChildSlotSpec(POLARIS_RACK)).toEqual({ count: 8, size: 3, label: 'Missile' })
    expect(componentOwnedChildSlotSpec(TALON_MSD683)).toEqual({ count: 12, size: 3, label: 'Missile' })
    expect(componentOwnedChildSlotSpec(ASGARD_MSD683)).toEqual({ count: 16, size: 3, label: 'Missile' })
  })

  it('two racks sharing the ambiguous display name "MSD-683 Missile Rack" (Talon vs Asgard) resolve to different real specs by entityClass alone', () => {
    if (!hasRackData) return
    const talon = componentOwnedChildSlotSpec(TALON_MSD683)
    const asgard = componentOwnedChildSlotSpec(ASGARD_MSD683)
    expect(talon?.count).toBe(12)
    expect(asgard?.count).toBe(16)
    expect(talon?.count).not.toBe(asgard?.count)
  })

  it('"MSD-543 Missile Rack" (325a) resolves its own real spec independent of the "MSD-683" cases sharing a similar naming scheme', () => {
    if (!hasRackData) return
    expect(componentOwnedChildSlotSpec(RACK_325A_MSD543)).toEqual({ count: 4, size: 3, label: 'Missile' })
  })

  it('three single-missile racks at different real missile sizes (S1/S2/S3) are distinguished by entityClass, never a shared "single rack" default', () => {
    if (!hasRackData) return
    expect(componentOwnedChildSlotSpec(RACK_S01_SINGLE)).toEqual({ count: 1, size: 1, label: 'Missile' })
    expect(componentOwnedChildSlotSpec(RACK_S02_SINGLE)).toEqual({ count: 1, size: 2, label: 'Missile' })
    expect(componentOwnedChildSlotSpec(RACK_S03_SINGLE)).toEqual({ count: 1, size: 3, label: 'Missile' })
  })

  it('a dual-slot rack (Fury) at S1 is distinguished from the single-slot S1 rack by count alone, same missile size', () => {
    if (!hasRackData) return
    const single = componentOwnedChildSlotSpec(RACK_S01_SINGLE)
    const dual = componentOwnedChildSlotSpec(RACK_FURY_DUAL)
    expect(dual).toEqual({ count: 2, size: 1, label: 'Missile' })
    expect(dual?.size).toBe(single?.size)
    expect(dual?.count).not.toBe(single?.count)
  })

  it('a mining head and a missile rack are never confused with each other — disjoint label, independent of lookup order', () => {
    if (!hasRackData) return
    expect(componentOwnedChildSlotSpec('Mining_Laser_GRIN_Arbor_S2')).toEqual({ count: 2, label: 'Module' })
    expect(componentOwnedChildSlotSpec(POLARIS_RACK)?.label).toBe('Missile')
  })
})

function rackHost(overrides: Partial<ComponentOwnedSlotHost> & Pick<ComponentOwnedSlotHost, 'id' | 'slotLabel'>): ComponentOwnedSlotHost {
  return { ...overrides }
}

describe('withComponentOwnedChildSlots — FTB-001B: dynamic missile rack swap behavior', () => {
  it('a factory rack with real, pre-existing ship-baked children (no swap: installed/target/factory all agree) is left completely untouched — backward compatibility for every existing saved fleet', () => {
    if (!hasRackData) return
    const rows = [
      rackHost({ id: 'rack', slotLabel: 'Right Missile Rack', factoryEntityClass: POLARIS_RACK, installedEntityClass: POLARIS_RACK, targetEntityClass: POLARIS_RACK }),
      rackHost({ id: 'slot-1', slotLabel: 'Right Missile Rack — Missile Slot 1', parentSlotLabel: 'Right Missile Rack' }),
      rackHost({ id: 'slot-2', slotLabel: 'Right Missile Rack — Missile Slot 2', parentSlotLabel: 'Right Missile Rack' }),
    ]
    const result = withComponentOwnedChildSlots(rows, (h, n, spec) => rackHost({ id: `${h.id}-${n}`, slotLabel: `${h.slotLabel} — ${spec.label} Slot ${n}`, parentSlotLabel: h.slotLabel }))
    expect(result).toBe(rows) // untouched, same reference — proves no unnecessary rebuild either
  })

  it('setting the Target to a different rack of a different missile capacity (Installed not yet changed — validating the Target state independently) removes the old children and previews the new source-derived count', () => {
    if (!hasRackData) return
    const rows = [
      // Deliberately no `installedEntityClass` — only Target has changed,
      // exactly the "Commander is previewing a swap in Loadout Manager,
      // hasn't installed it yet" state this mission calls out separately
      // from Installed.
      rackHost({ id: 'rack', slotLabel: 'Right Missile Rack', factoryEntityClass: POLARIS_RACK, targetEntityClass: TALON_MSD683 }),
      ...Array.from({ length: 8 }, (_, i) => rackHost({ id: `stale-${i + 1}`, slotLabel: `Right Missile Rack — Missile Slot ${i + 1}`, parentSlotLabel: 'Right Missile Rack' })),
    ]
    const result = withComponentOwnedChildSlots(rows, (h, n, spec) => rackHost({ id: `${h.id}-${n}`, slotLabel: `${h.slotLabel} — ${spec.label} Slot ${n}`, parentSlotLabel: h.slotLabel }))
    const staleSurvived = result.some((r) => r.id.startsWith('stale-'))
    expect(staleSurvived).toBe(false)
    const newChildren = result.filter((r) => r.parentSlotLabel === 'Right Missile Rack')
    expect(newChildren).toHaveLength(12) // Talon's real count, not the old Polaris count of 8
  })

  it('the Installed state (physically swapped, not just targeted) drives the child slots identically to the Target-only preview case', () => {
    if (!hasRackData) return
    const rows = [
      rackHost({ id: 'rack', slotLabel: 'Right Missile Rack', factoryEntityClass: POLARIS_RACK, installedEntityClass: TALON_MSD683, targetEntityClass: TALON_MSD683 }),
      ...Array.from({ length: 8 }, (_, i) => rackHost({ id: `stale-${i + 1}`, slotLabel: `Right Missile Rack — Missile Slot ${i + 1}`, parentSlotLabel: 'Right Missile Rack' })),
    ]
    const result = withComponentOwnedChildSlots(rows, (h, n, spec) => rackHost({ id: `${h.id}-${n}`, slotLabel: `${h.slotLabel} — ${spec.label} Slot ${n}`, parentSlotLabel: h.slotLabel }))
    expect(result.some((r) => r.id.startsWith('stale-'))).toBe(false)
    expect(result.filter((r) => r.parentSlotLabel === 'Right Missile Rack')).toHaveLength(12)
  })

  it('replacing a factory rack with a rack supporting a different missile size updates the child slots’ own size', () => {
    if (!hasRackData) return
    interface SizedHost extends ComponentOwnedSlotHost {
      size?: number
    }
    const rows: SizedHost[] = [
      { id: 'rack', slotLabel: 'Rack', factoryEntityClass: RACK_S03_SINGLE, installedEntityClass: RACK_S01_SINGLE },
      { id: 'stale-1', slotLabel: 'Rack — Missile Slot 1', parentSlotLabel: 'Rack' },
    ]
    const result = withComponentOwnedChildSlots(rows, (h, n, spec): SizedHost => ({
      id: `${h.id}-${n}`,
      slotLabel: `${h.slotLabel} — ${spec.label} Slot ${n}`,
      parentSlotLabel: h.slotLabel,
      size: spec.size,
    }))
    const newChild = result.find((r) => r.parentSlotLabel === 'Rack')
    expect(newChild).toBeDefined()
    expect(newChild?.size).toBe(1) // the NEW rack's own S1 missile size, not the old factory rack's S3
  })

  it('swapping to a rack with no known real spec removes the stale children and adds nothing — an honest "unknown structure" state, never a fabricated guess', () => {
    if (!hasRackData) return
    const rows = [
      rackHost({ id: 'rack', slotLabel: 'Rack', factoryEntityClass: POLARIS_RACK, installedEntityClass: 'Some_Entirely_Unknown_Rack_Entity' }),
      rackHost({ id: 'stale-1', slotLabel: 'Rack — Missile Slot 1', parentSlotLabel: 'Rack' }),
    ]
    const result = withComponentOwnedChildSlots(rows, (h, n, spec) => rackHost({ id: `${h.id}-${n}`, slotLabel: `${h.slotLabel} — ${spec.label} Slot ${n}`, parentSlotLabel: h.slotLabel }))
    expect(result.some((r) => r.parentSlotLabel === 'Rack')).toBe(false)
    expect(result.some((r) => r.id === 'stale-1')).toBe(false)
  })

  it('repeated rack changes never leave stale child rows behind — each swap fully replaces the previous slot set', () => {
    if (!hasRackData) return
    let rows: ComponentOwnedSlotHost[] = [rackHost({ id: 'rack', slotLabel: 'Rack', factoryEntityClass: POLARIS_RACK, installedEntityClass: POLARIS_RACK })]
    const makeSlot = (h: ComponentOwnedSlotHost, n: number, spec: { label: string }) => rackHost({ id: `${h.id}-${n}-${Math.random()}`, slotLabel: `${h.slotLabel} — ${spec.label} Slot ${n}`, parentSlotLabel: h.slotLabel })

    // Materialize the real factory children once (simulating what the
    // ship-baked template already provides for the unswapped factory rack).
    rows = withComponentOwnedChildSlots(rows, makeSlot)
    expect(rows.filter((r) => r.parentSlotLabel === 'Rack')).toHaveLength(8)

    // Swap once to the Talon rack (12 slots) — note this now counts as a
    // "swap" since installedEntityClass differs from factoryEntityClass,
    // so the old 8 are replaced even though they were only just added.
    rows = rows.map((r) => (r.id === 'rack' ? { ...r, installedEntityClass: TALON_MSD683 } : r))
    rows = withComponentOwnedChildSlots(rows, makeSlot)
    expect(rows.filter((r) => r.parentSlotLabel === 'Rack')).toHaveLength(12)

    // Swap again to the Asgard rack (16 slots).
    rows = rows.map((r) => (r.id === 'rack' ? { ...r, installedEntityClass: ASGARD_MSD683 } : r))
    rows = withComponentOwnedChildSlots(rows, makeSlot)
    expect(rows.filter((r) => r.parentSlotLabel === 'Rack')).toHaveLength(16)
  })

  it('MissionComposer\'s live, not-yet-saved picker selection (previewTargetEntityClass) drives the swap immediately — before Installed ever changes, satisfying "child-slot structure updates immediately"', () => {
    if (!hasRackData) return
    const rows = [
      // installedEntityClass still matches factory (nothing physically
      // installed differently) — only the live preview selection differs.
      rackHost({ id: 'rack', slotLabel: 'Rack', factoryEntityClass: RACK_S02_SINGLE, installedEntityClass: RACK_S02_SINGLE, previewTargetEntityClass: RACK_S01_SINGLE }),
      rackHost({ id: 'stale-1', slotLabel: 'Rack — Missile Slot 1', parentSlotLabel: 'Rack' }),
    ]
    const result = withComponentOwnedChildSlots(rows, (h, n, spec) => rackHost({ id: `${h.id}-${n}`, slotLabel: `${h.slotLabel} — ${spec.label} Slot ${n}`, parentSlotLabel: h.slotLabel }))
    expect(result.some((r) => r.id === 'stale-1')).toBe(false)
    expect(result.filter((r) => r.parentSlotLabel === 'Rack')).toHaveLength(1) // RACK_S01_SINGLE's real count
  })
})
