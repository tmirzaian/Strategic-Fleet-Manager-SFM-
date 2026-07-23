import { describe, it, expect } from 'vitest'
import { getConfigurableSlotsForShip, hasConfigurableSlotsCatalog } from '../configurableSlots'

describe('src/generated/configurableSlots.ts — SW-011A runtime loader', () => {
  it('the committed runtime catalog exists and is non-empty', () => {
    expect(hasConfigurableSlotsCatalog).toBe(true)
  })

  it('returns an empty array (never throws, never undefined) for an unknown ship', () => {
    expect(getConfigurableSlotsForShip('Totally_Unknown_Entity_Class')).toEqual([])
  })

  it('returns an empty array for null/undefined input, never throws', () => {
    expect(getConfigurableSlotsForShip(null)).toEqual([])
    expect(getConfigurableSlotsForShip(undefined)).toEqual([])
  })

  it('the real, live-confirmed Hornet Mk II center weapon mount is present (ANVL_Hornet_F7CS_Mk2)', () => {
    const slots = getConfigurableSlotsForShip('ANVL_Hornet_F7CS_Mk2')
    const centerMount = slots.find((s) => s.portName === 'hardpoint_weapon_center')
    expect(centerMount).toBeDefined()
    expect(centerMount?.swapGroupId).toBe('$ANVL_Hornet_Mk2_Center')
    expect(centerMount?.category).toBe('A-confirmed')
    expect(centerMount?.eligibleComponentCount).toBeGreaterThan(1)
  })

  it('never includes a Category D (rejected) slot for any ship', () => {
    // Structural invariant, not a spot check: the runtime catalog writer
    // filters D-rejected out entirely (catalogRuntimeWriter.ts) — this
    // proves it held for the real, live-generated file, not just the
    // unit-tested pure function.
    const modules = import.meta.glob<{ default: unknown }>('../../../generated-data/configurable-slots.runtime.json', { eager: true })
    const raw = Object.values(modules)[0]?.default as { ships: Record<string, { category: string }[]> } | undefined
    expect(raw).toBeDefined()
    for (const records of Object.values(raw!.ships)) {
      for (const record of records) {
        expect(record.category).not.toBe('D-rejected')
      }
    }
  })
})
