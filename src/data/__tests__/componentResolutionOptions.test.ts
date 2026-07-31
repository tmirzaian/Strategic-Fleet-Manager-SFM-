import { describe, it, expect } from 'vitest'
import { resolveComponentCatalogEntryDetailed } from '../componentCatalog'
import { resolveComponentByEntityClass, resolveComponentByName } from '../../generated/componentCatalog'

/**
 * EWO-083 — Canonical Component Catalog Resolver. Focused unit tests for
 * the normalization/case-insensitive/alias-hook/consistent-not-found
 * capabilities added to `resolveComponentCatalogEntryDetailed` (the
 * pre-existing canonical resolver, widened rather than replaced — see
 * docs/Beta-2.1-Stabilization-Resolver-Audit.md §1.4 and §4).
 *
 * Reuses the same real, licensed-catalog fixtures already established by
 * src/data/__tests__/pdcCompatibility.test.ts: the three M2C "Swarm"
 * entity classes are a genuinely ambiguous real display name (two
 * incompatible compatibility shapes), and `KLWE_LaserRepeater_S2` ("CF-227
 * Badger Repeater") is a real, ordinary, unambiguous S2 weapon. Every test
 * that needs the real generated catalog guards on it being present on this
 * machine (gitignored per ADR-005) and skips — never fails — when absent,
 * matching the existing convention throughout this test suite.
 */

const PDC_BEHR = 'Turret_PDC_BEHR_A'
const PDC_VNCL = 'Turret_PDC_VNCL'
const PDC_GUN = 'BEHR_LaserRepeater_PDC_S1'
const SWARM_NAME = 'M2C "Swarm"'
const ORDINARY_ENTITY_CLASS = 'KLWE_LaserRepeater_PDC_S2'
// A real display name resolved by exactly one entityClass — unlike
// ORDINARY_NAME above (which two distinct-but-shape-identical entity
// classes both happen to share), this fixture is unambiguous even under
// the simpler, non-shape-collapsing case-insensitive fallback index below.
const SINGLE_MATCH_ENTITY_CLASS = 'AMRS_LaserCannon_S1'
const SINGLE_MATCH_NAME = 'Omnisky III Cannon'
const ORDINARY_NAME = 'CF-227 Badger Repeater'

const hasCatalog = resolveComponentByEntityClass(PDC_BEHR).status === 'resolved'
function skipIfNoCatalog() {
  return !hasCatalog
}

describe('EWO-083: resolveComponentCatalogEntryDetailed — default behavior is unchanged', () => {
  it('1. an ambiguous name still resolves "ambiguous" with no options supplied (regression guard)', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed(SWARM_NAME)
    expect(result.status).toBe('ambiguous')
  })

  it('2. an unambiguous real name still resolves normally with no options supplied', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed(ORDINARY_NAME)
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.entry.entityClass).toBe(ORDINARY_ENTITY_CLASS)
  })

  it('3. a name with no catalog match at all still resolves "unresolved" with no options supplied', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed('Not A Real Component Name XYZ')
    expect(result.status).toBe('unresolved')
  })
})

describe('EWO-083: normalization — trimming is always on, never a behavior change for an already-clean input', () => {
  it('4. leading/trailing whitespace around an unambiguous name still resolves the same entity', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed(`  ${ORDINARY_NAME}  `)
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.entry.entityClass).toBe(ORDINARY_ENTITY_CLASS)
  })

  it('5. whitespace around an entityClass-qualified lookup does not affect the entityClass path', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed(`  ${SWARM_NAME}  `, PDC_VNCL)
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.entry.entityClass).toBe(PDC_VNCL)
  })
})

describe('EWO-083: onAmbiguous — opt-in "first real candidate" mode for legacy-parity callers', () => {
  it('6. onAmbiguous: "strict" (or omitted) refuses an ambiguous name, matching pre-existing behavior', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed(SWARM_NAME, undefined, { onAmbiguous: 'strict' })
    expect(result.status).toBe('ambiguous')
  })

  it('7. onAmbiguous: "permissive" resolves to one of the real candidates instead of refusing', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed(SWARM_NAME, undefined, { onAmbiguous: 'permissive' })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect([PDC_BEHR, PDC_VNCL, PDC_GUN]).toContain(result.entry.entityClass)
  })

  it('8. "permissive" never fabricates a candidate — it always picks a real, genuinely cataloged one', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed(SWARM_NAME, undefined, { onAmbiguous: 'permissive' })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    const realCandidates = resolveComponentByName(SWARM_NAME)
    expect(realCandidates.status).toBe('ambiguous')
    if (realCandidates.status !== 'ambiguous') return
    expect(realCandidates.candidates.map((c) => c.entityClass)).toContain(result.entry.entityClass)
  })
})

describe('EWO-083: caseInsensitiveFallback — off by default, opt-in second-chance lookup', () => {
  it('9. off by default: a case-mismatched real name resolves "unresolved", exactly as before this mission', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed(ORDINARY_NAME.toUpperCase())
    expect(result.status).toBe('unresolved')
  })

  it('10. enabled: the same case-mismatched name now resolves to the real entity', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed(SINGLE_MATCH_NAME.toUpperCase(), undefined, { caseInsensitiveFallback: true })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.entry.entityClass).toBe(SINGLE_MATCH_ENTITY_CLASS)
  })

  it("10b. enabled, but the case-insensitive index isn't shape-collapsing: a name shared (even non-ambiguously under exact match) by two entity classes resolves 'ambiguous' here unless permissive mode is also on", () => {
    if (skipIfNoCatalog()) return
    const strict = resolveComponentCatalogEntryDetailed(ORDINARY_NAME.toUpperCase(), undefined, { caseInsensitiveFallback: true })
    expect(strict.status).toBe('ambiguous')
    const permissive = resolveComponentCatalogEntryDetailed(ORDINARY_NAME.toUpperCase(), undefined, {
      caseInsensitiveFallback: true,
      onAmbiguous: 'permissive',
    })
    expect(permissive.status).toBe('resolved')
  })

  it('11. enabled, but the input is genuinely uncataloged in any case: still resolves "unresolved"', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed('NOT A REAL COMPONENT NAME XYZ', undefined, { caseInsensitiveFallback: true })
    expect(result.status).toBe('unresolved')
  })

  it('12. an exact-case match is still resolved directly and never needs the fallback (fallback is a last resort, not a first choice)', () => {
    if (skipIfNoCatalog()) return
    const withFallback = resolveComponentCatalogEntryDetailed(ORDINARY_NAME, undefined, { caseInsensitiveFallback: true })
    const withoutFallback = resolveComponentCatalogEntryDetailed(ORDINARY_NAME)
    expect(withFallback).toEqual(withoutFallback)
  })

  it('13. a case-mismatched AMBIGUOUS name defaults to "ambiguous" (strict) even with the fallback enabled', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed(SWARM_NAME.toUpperCase(), undefined, { caseInsensitiveFallback: true })
    expect(result.status).toBe('ambiguous')
  })

  it('14. a case-mismatched AMBIGUOUS name resolves to a real candidate when both fallback and permissive are enabled together', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed(SWARM_NAME.toUpperCase(), undefined, {
      caseInsensitiveFallback: true,
      onAmbiguous: 'permissive',
    })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect([PDC_BEHR, PDC_VNCL, PDC_GUN]).toContain(result.entry.entityClass)
  })
})

describe('EWO-083: aliasMap — architectural hook only, unused unless a caller explicitly supplies one', () => {
  it('15. an unrecognized legacy name resolves "unresolved" when no aliasMap is supplied', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed('Legacy Nickname For Ordinary Weapon')
    expect(result.status).toBe('unresolved')
  })

  it('16. the same legacy name resolves through to the real component once an aliasMap remaps it', () => {
    if (skipIfNoCatalog()) return
    const aliasMap = new Map([['Legacy Nickname For Ordinary Weapon', ORDINARY_NAME]])
    const result = resolveComponentCatalogEntryDetailed('Legacy Nickname For Ordinary Weapon', undefined, { aliasMap })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.entry.entityClass).toBe(ORDINARY_ENTITY_CLASS)
  })

  it('17. aliasMap is consulted before the CATALOG override table (an alias to a hand-authored override name still resolves)', () => {
    if (skipIfNoCatalog()) return
    const aliasMap = new Map([['Old Mirage Nickname', 'Mirage']])
    const result = resolveComponentCatalogEntryDetailed('Old Mirage Nickname', undefined, { aliasMap })
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.entry.category).toBe('Shield')
    expect(result.entry.size).toBe(1)
  })
})

describe('EWO-083: the resolved entry now carries grade/manufacturerCode/classification (EWO-083 widened CatalogEntry)', () => {
  it('18. a resolved catalog-sourced entry exposes the same grade the generated catalog itself reports', () => {
    if (skipIfNoCatalog()) return
    const result = resolveComponentCatalogEntryDetailed(ORDINARY_NAME)
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    const raw = resolveComponentByEntityClass(ORDINARY_ENTITY_CLASS)
    expect(raw.status).toBe('resolved')
    if (raw.status !== 'resolved') return
    expect(result.entry.grade).toBe(raw.record.grade)
    expect(result.entry.manufacturerCode).toBe(raw.record.manufacturerCode)
    expect(result.entry.classification).toBe(raw.record.classification)
  })

  it('19. a hand-authored CATALOG override entry (no generated-catalog backing) leaves grade/manufacturerCode/classification undefined, never fabricated', () => {
    const result = resolveComponentCatalogEntryDetailed('Mirage')
    expect(result.status).toBe('resolved')
    if (result.status !== 'resolved') return
    expect(result.entry.grade).toBeUndefined()
    expect(result.entry.manufacturerCode).toBeUndefined()
    expect(result.entry.classification).toBeUndefined()
  })
})
