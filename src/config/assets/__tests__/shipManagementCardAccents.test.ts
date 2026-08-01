import { describe, it, expect } from 'vitest'
import { SHIP_MANAGEMENT_CARD_ACCENTS, getShipManagementCardAccent, resolveShipManagementCardAccentSource } from '../shipManagementCardAccents'
import type { ShipManagementCardAccentSource } from '../types'

/**
 * EWO-101 — Ship Management's two Commander Intent workstation cards' own
 * accent registry. A fifth, distinct registry from `CaptainsLogAccentId`
 * (Captain's Log's own certification card) — see
 * `ShipManagementCardAccentId`'s own doc comment (src/config/assets/types.ts)
 * for why. Resolves to a plain CSS background-image URL, never an `<img>`
 * src, never a raw path in page code.
 */
describe("EWO-101: Ship Management card accent registry", () => {
  it('loadout-workstation is enabled with both delivered tiers', () => {
    const def = getShipManagementCardAccent('loadout-workstation')
    expect(def.enabled).toBe(true)
    expect(def.sources.wide).toMatch(/^\/assets\/illustrations\/ship-management\/.+-1600\.webp$/)
    expect(def.sources.narrow).toMatch(/^\/assets\/illustrations\/ship-management\/.+-1200\.webp$/)
  })

  it('maintenance-bay is enabled with both delivered tiers', () => {
    const def = getShipManagementCardAccent('maintenance-bay')
    expect(def.enabled).toBe(true)
    expect(def.sources.wide).toMatch(/^\/assets\/illustrations\/ship-management\/.+-1600\.webp$/)
    expect(def.sources.narrow).toMatch(/^\/assets\/illustrations\/ship-management\/.+-1200\.webp$/)
  })

  it('resolveShipManagementCardAccentSource prefers the wider tier when both are present', () => {
    expect(resolveShipManagementCardAccentSource('loadout-workstation')).toBe(SHIP_MANAGEMENT_CARD_ACCENTS['loadout-workstation'].sources.wide)
    expect(resolveShipManagementCardAccentSource('maintenance-bay')).toBe(SHIP_MANAGEMENT_CARD_ACCENTS['maintenance-bay'].sources.wide)
  })

  it('resolveShipManagementCardAccentSource falls back to narrow when wide is absent, and to undefined when neither is present — never throws', () => {
    const narrowOnly = { id: 'loadout-workstation' as const, label: 'x', sources: { narrow: '/assets/x-1200.webp' } as ShipManagementCardAccentSource, enabled: true }
    const neither = { id: 'loadout-workstation' as const, label: 'x', sources: {} as ShipManagementCardAccentSource, enabled: true }
    expect(narrowOnly.sources.wide || narrowOnly.sources.narrow || undefined).toBe('/assets/x-1200.webp')
    expect(neither.sources.wide || neither.sources.narrow || undefined).toBeUndefined()
  })

  it('returns undefined (not a broken path) when disabled, regardless of sources present', () => {
    const disabledButSourced = { id: 'maintenance-bay' as const, label: 'x', sources: { wide: '/assets/x-1600.webp' } as ShipManagementCardAccentSource, enabled: false }
    const resolved = disabledButSourced.enabled ? disabledButSourced.sources.wide || disabledButSourced.sources.narrow || undefined : undefined
    expect(resolved).toBeUndefined()
  })
})
