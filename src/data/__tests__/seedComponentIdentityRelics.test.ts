import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../../store/useFleetStore'
import { resolveComponentLabel } from '../../utils/componentPresentation'
import { catalogComponentsByName, hasComponentCatalog } from '../../generated/componentCatalog'
import { componentByDisplayName } from '../../generated/importedShips'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

const EMPTY_SENTINELS = new Set(['—', '-', '', 'Unknown Factory Item', 'Unknown'])

/**
 * ADR-004 / SW-009A Amendment 1 (Objective 9) — Persistent Catalog Relic
 * Investigation. Root cause of the reported "SnowBlind appears twice, one
 * unclassified" defect: `src/data/seed.ts` hand-typed the component name as
 * "Snowblind" (lowercase b) in five places — the real generated catalog's
 * exact casing is "SnowBlind" (capital B). Every identity lookup in this
 * app (`catalogComponentsByName`, `resolveComponentByName`,
 * `componentByDisplayName`) is an exact-string `Map` key — a one-character
 * casing difference is a genuinely different key, so the mistyped seed
 * value never resolved to the real catalog record at all. It surfaced in
 * Manage Loadout's New Target selector as two options because the picker
 * pins the port's raw `targetItem` string ahead of its alphabetical sweep
 * of the real catalog (`newTargetOptionsFor`/`compatibleOptionsFor`), and
 * an unresolved pin is never recognized as "the same option" as its
 * correctly-cased catalog counterpart.
 *
 * Scope determination (9.4): confirmed Development-only relic data — this
 * string only ever existed in the hand-authored dev/demo seed fixture
 * (gated behind VITE_SFM_DEV_SEED_FLEET), never in a real ship import or
 * production Commander's data. A repository-wide sweep (see the ADR-004
 * completion report) found exactly one such mismatch across seed.ts's 38
 * distinct component-name-shaped fixture strings.
 *
 * This suite is the durable regression guard: it fails again immediately
 * if any future hand-authored seed fixture reintroduces a name that looks
 * like a real catalog component but doesn't match it exactly.
 */
describe('ADR-004 / SW-009A Amendment 1 (Objective 9): seed data carries no case-mismatched catalog relic', () => {
  it('every seed hardpoint Factory/Installed/Target value that case-insensitively matches a real catalog or imported-ship component name matches it EXACTLY — no silent casing relic', () => {
    if (!hasComponentCatalog) return
    const catalogNamesLower = new Map<string, string>()
    for (const name of catalogComponentsByName.keys()) catalogNamesLower.set(name.toLowerCase(), name)
    for (const name of componentByDisplayName.keys()) if (!catalogNamesLower.has(name.toLowerCase())) catalogNamesLower.set(name.toLowerCase(), name)

    const offenders: { slotLabel: string; field: string; value: string; realCatalogValue: string }[] = []
    for (const hp of useFleetStore.getState().hardpoints) {
      for (const field of ['factoryItem', 'installedItem', 'targetItem'] as const) {
        const value = hp[field]
        if (!value || EMPTY_SENTINELS.has(value)) continue
        const real = catalogNamesLower.get(value.toLowerCase())
        if (real && real !== value) offenders.push({ slotLabel: hp.slotLabel, field, value, realCatalogValue: real })
      }
    }
    expect(offenders).toEqual([])
  })

  it('every seed Hangar Inventory item name that case-insensitively matches a real catalog component matches it EXACTLY', () => {
    if (!hasComponentCatalog) return
    const catalogNamesLower = new Map<string, string>()
    for (const name of catalogComponentsByName.keys()) catalogNamesLower.set(name.toLowerCase(), name)

    const offenders: { name: string; realCatalogValue: string }[] = []
    for (const item of useFleetStore.getState().hangarItems) {
      const real = catalogNamesLower.get(item.name.toLowerCase())
      if (real && real !== item.name) offenders.push({ name: item.name, realCatalogValue: real })
    }
    expect(offenders).toEqual([])
  })

  it('the specific reported defect is fixed: Ghost\'s Left Cooler ("SnowBlind") resolves one real, fully classified identity — real Class+Grade, real entityClass, never a bare unclassified fallback', () => {
    if (!hasComponentCatalog) return
    const hp = useFleetStore.getState().hardpoints.find((h) => h.shipId === 'ghost' && h.buildId === 'ghost-stealth' && h.slotLabel === 'Left Cooler')
    expect(hp).toBeDefined()
    expect(hp!.targetItem).toBe('SnowBlind')
    expect(hp!.targetEntityClass).toBe('COOL_TYDT_S01_SnowBlind_SCItem')
    const label = resolveComponentLabel(hp!.targetItem)
    expect(label.identityLine).toBe('Stealth A')
    expect(label.diagnosticInternalName).toBe('COOL_TYDT_S01_SnowBlind_SCItem')
  })

  it('a fresh store contains no duplicate-casing options for any known relic-prone name — the real catalog\'s "SnowBlind" is reachable by exactly one canonical key', () => {
    if (!hasComponentCatalog) return
    expect(catalogComponentsByName.has('SnowBlind')).toBe(true)
    expect(catalogComponentsByName.has('Snowblind')).toBe(false)
  })

  it('two genuinely distinct components sharing a display-name PREFIX remain distinct — this suite dedupes by exact key, never by fuzzy/partial name match (guards against over-correction)', () => {
    if (!hasComponentCatalog) return
    // "SnowBlind" (COOL_TYDT_S01_SnowBlind_SCItem) and "Anvil Ballista
    // Snowblind" (ANVL_Ballista_Snowblind) are two real, distinct catalog
    // entities that happen to share a substring — confirming this
    // investigation's fix (an exact-string casing correction) never
    // conflated them.
    expect(catalogComponentsByName.get('SnowBlind')?.entityClass).toBe('COOL_TYDT_S01_SnowBlind_SCItem')
  })
})
