import { describe, it, expect } from 'vitest'
import { componentOwnedChildSlotCount, withComponentOwnedChildSlots, type ComponentOwnedSlotHost } from '../componentOwnedSlots'
import { getMiningModuleSlotCount } from '../../generated/miningModuleSlots'

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
