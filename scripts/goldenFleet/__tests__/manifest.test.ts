import { describe, it, expect } from 'vitest'
import { buildManifest, resolveSeedEntityClass } from '../manifest'
import { selectableShipDefinitions } from '../../../src/data/shipDefinitions'

describe('GF-002B: manifest generation', () => {
  it('produces exactly one row per canonical selectable hull, matching selectableShipDefinitions exactly', () => {
    const manifest = buildManifest()
    expect(manifest.length).toBe(selectableShipDefinitions.length)
    expect(manifest.length).toBe(258)
  })

  it('every canonical hull appears exactly once — no duplicates', () => {
    const manifest = buildManifest()
    const ids = manifest.map((e) => e.canonicalId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('manifest generation is deterministic — two independent builds produce identical output', () => {
    const a = buildManifest()
    const b = buildManifest()
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('manifest order is stable and matches selectableShipDefinitions order exactly', () => {
    const manifest = buildManifest()
    expect(manifest.map((e) => e.canonicalId)).toEqual(selectableShipDefinitions.map((d) => d.id))
  })

  it('every DEEP-IMPORTED hull is marked alreadyInRawData and requests its sourceEntityClass', () => {
    const manifest = buildManifest()
    const deepImported = manifest.filter((e) => e.sourceClass === 'DEEP-IMPORTED')
    expect(deepImported.length).toBe(6)
    for (const e of deepImported) {
      expect(e.alreadyInRawData).toBe(true)
      expect(e.requestedEntityIdSource).toBe('sourceEntityClass')
      expect(e.requestedEntityId).toBeTruthy()
    }
  })

  it('every CATALOG-ONLY hull requests its own id as the entity class, and is not already in raw-data', () => {
    const manifest = buildManifest()
    const catalogOnly = manifest.filter((e) => e.sourceClass === 'CATALOG-ONLY')
    expect(catalogOnly.length).toBe(242)
    for (const e of catalogOnly) {
      expect(e.requestedEntityId).toBe(e.canonicalId)
      expect(e.requestedEntityIdSource).toBe('catalogEntityClassId')
      expect(e.alreadyInRawData).toBe(false)
    }
  })

  it('all 10 SEED-BACKED hulls resolve to exactly one entity id with no ambiguity, given the current catalog', () => {
    const manifest = buildManifest()
    const seedBacked = manifest.filter((e) => e.sourceClass === 'SEED-BACKED')
    expect(seedBacked.length).toBe(10)
    for (const e of seedBacked) {
      expect(e.requestedEntityId).toBeTruthy()
      expect(e.requestedEntityIdSource).toBe('seedNameMatch')
      expect(e.alternateCandidates.length).toBeLessThanOrEqual(1)
    }
  })

  it('resolveSeedEntityClass matches M80 to ORIG_m80 unambiguously', () => {
    const result = resolveSeedEntityClass('M80')
    expect(result.matched?.entityClass).toBe('ORIG_m80')
  })

  it('resolveSeedEntityClass matches Starlite to MISC_Starlite despite the catalog manufacturer.name/code not matching the displayName prefix literally', () => {
    const result = resolveSeedEntityClass('Starlite')
    expect(result.matched?.entityClass).toBe('MISC_Starlite')
  })

  it('resolveSeedEntityClass reports zero candidates (never a guess) for a name with no catalog match at all', () => {
    const result = resolveSeedEntityClass('Not A Real Ship Name Xyz123')
    expect(result.matched).toBeNull()
    expect(result.candidates).toEqual([])
  })

  it('expected output filenames are unique, except two known pre-existing duplicate-hull pairs EWO-021 did not dedupe (GF-002B Task 7 finding, out of this mission\'s scope to fix)', () => {
    const manifest = buildManifest()
    const byFilename = new Map<string, string[]>()
    for (const e of manifest) {
      const arr = byFilename.get(e.expectedOutputFilename) ?? []
      arr.push(e.canonicalId)
      byFilename.set(e.expectedOutputFilename, arr)
    }
    const duplicated = [...byFilename.entries()].filter(([, ids]) => ids.length > 1)
    // Known: seed "prospector"/"starlite" and their independently-selectable
    // Mission M-012 catalog-only counterparts ("MISC_Prospector",
    // "MISC_Starlite") were never merged by shipDefinitions.ts's own
    // bareHullName() dedup, because that function requires the definition's
    // own `.manufacturer` field to corroborate the stripped prefix, and
    // "MISC" (the displayName's own literal prefix) matches neither the
    // catalog's `manufacturer.name` ("Musashi Industrial & Starflight
    // Concern") nor `.code` ("MIS"). This is a real, pre-existing SFM
    // canonical-identity gap — not a manifest bug — flagged for a future
    // identity ruling, not fixed here (NOT AUTHORIZED: canonical aliases).
    expect(duplicated.map(([filename]) => filename).sort()).toEqual(['MISC_Prospector.json', 'MISC_Starlite.json'])
  })
})
