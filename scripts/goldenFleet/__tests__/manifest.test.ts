import { describe, it, expect } from 'vitest'
import { buildManifest, resolveSeedEntityClass } from '../manifest'
import { selectableShipDefinitions } from '../../../src/data/shipDefinitions'

// MWO-001: this suite's hardcoded totals reflect the state AFTER the 4.9
// Golden Fleet promotion (raw-data now holds 256 deep-imported hulls, not
// the pre-promotion 6). Re-running buildManifest() today mostly reports
// hulls as already acquired — that's the correct, expected shape of a
// manifest built against an already-promoted repository, not a bug.
//
// CWO-005 (Task 1): fixing deep-imported ships' canonical display name to
// the real RSI/CIG name (sourced from the same universe catalog every
// catalog-only placeholder already reads its own displayName from) let 8
// more catalog-only variant/livery placeholders correctly bareHullName-
// match their now-correctly-named deep-imported sibling — the exact same
// EWO-021 dedup mechanism that already consolidated the other 24. 264 ->
// 256, and the 8 remaining catalog-only entries above -> 0.
describe('GF-002B: manifest generation', () => {
  it('produces exactly one row per canonical selectable hull, matching selectableShipDefinitions exactly', () => {
    const manifest = buildManifest()
    expect(manifest.length).toBe(selectableShipDefinitions.length)
    // RC-001: fixing the .localization-cache staleness bug and
    // regenerating the ship catalog against current LIVE surfaced 5 real
    // ships a stale cache had previously hidden behind a null displayName
    // (Grey's Basher plus 4 others — ARGO MOLE Alliance, Drake Clipper
    // Wikelo War Special, Drake Golem Alliance, MISC Prospector Alliance).
    // None of them are deep-imported yet, so they land as new
    // catalog-only entries. 256 -> 261.
    expect(manifest.length).toBe(261)
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
    // 256 = the full post-promotion raw-data set. This also now includes
    // all 10 previously SEED-BACKED hulls (Ghost, MOLE, Railen, 135c, M80,
    // Starlite, UTV, Vulture, Prospector, Cutlass Red) — MWO-001 (Task 2)
    // aliases each seed id to its real deep-imported definition, so
    // selectableShipDefinitions now reports them as DEEP-IMPORTED, not
    // SEED-BACKED (see the next test).
    // RC-001A: Grey's Basher promoted via the small-delta Golden Fleet
    // workflow (real StarBreaker export, no hand-authored loadout) — 256 -> 257.
    expect(deepImported.length).toBe(257)
    for (const e of deepImported) {
      expect(e.alreadyInRawData).toBe(true)
      expect(e.requestedEntityIdSource).toBe('sourceEntityClass')
      expect(e.requestedEntityId).toBeTruthy()
    }
  })

  it('every CATALOG-ONLY hull requests its own id as the entity class, and is not already in raw-data', () => {
    const manifest = buildManifest()
    const catalogOnly = manifest.filter((e) => e.sourceClass === 'CATALOG-ONLY')
    // RC-001: 5 real ships (Grey's Basher + 4 others) a stale
    // .localization-cache/ previously hid behind a null displayName are
    // now correctly resolved and enumerated — none have been deep-imported
    // yet, so all 5 land here as genuine catalog-only entries. 0 -> 5.
    // RC-001A: Grey's Basher itself was then promoted (deep-imported),
    // leaving the other 4. 5 -> 4.
    expect(catalogOnly.length).toBe(4)
    for (const e of catalogOnly) {
      expect(e.requestedEntityId).toBe(e.canonicalId)
      expect(e.requestedEntityIdSource).toBe('catalogEntityClassId')
      expect(e.alreadyInRawData).toBe(false)
    }
  })

  it('zero SEED-BACKED hulls remain selectable post-promotion — every one now resolves as DEEP-IMPORTED (MWO-001, Task 2)', () => {
    const manifest = buildManifest()
    const seedBacked = manifest.filter((e) => e.sourceClass === 'SEED-BACKED')
    expect(seedBacked.length).toBe(0)
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

  it('expected output filenames are all unique post-promotion (MWO-001) — the prior Prospector/Starlite duplicate-filename gap (GF-002B Task 7 finding) no longer exists', () => {
    const manifest = buildManifest()
    const byFilename = new Map<string, string[]>()
    for (const e of manifest) {
      const arr = byFilename.get(e.expectedOutputFilename) ?? []
      arr.push(e.canonicalId)
      byFilename.set(e.expectedOutputFilename, arr)
    }
    const duplicated = [...byFilename.entries()].filter(([, ids]) => ids.length > 1)
    // The prior gap: seed "prospector"/"starlite" and their independently
    // selectable Mission M-012 catalog-only counterparts ("MISC_Prospector",
    // "MISC_Starlite") were never merged by shipDefinitions.ts's own
    // bareHullName() dedup, producing two manifest rows requesting the same
    // physical export filename. Now that both entity classes are actually
    // deep-imported (MWO-001), their catalog-only placeholders are excluded
    // from the roster entirely (DEEP_IMPORTED_ENTITY_CLASSES) — there is no
    // longer a second row to collide with.
    expect(duplicated).toEqual([])
  })
})
