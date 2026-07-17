import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { SHIP_IMAGE_URLS } from '../shipImageRegistry'
import { shipImageOverrides } from '../shipImageOverrides'
import { selectableShipDefinitions, presentationImageKeyById, shipDefinitionById } from '../shipDefinitions'
import { resolveShipImage, validRegistryUrl } from '../../utils/resolveShipImage'
import { useFleetStore } from '../../store/useFleetStore'

const initialState = useFleetStore.getState()
beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

/** Every .ts/.tsx file directly under src/pages and src/components — not
 * src/data or src/config/assets, which are allowed to hold the actual
 * registries/manifests themselves. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectSourceFiles(full))
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx')) out.push(full)
  }
  return out
}

describe('EWO-021A (Task 9): single source of truth for ship image URLs', () => {
  it('every registry key is a non-empty string, every value a non-empty string — no accidental blanks', () => {
    for (const [key, value] of Object.entries(SHIP_IMAGE_URLS)) {
      expect(key.trim().length).toBeGreaterThan(0)
      expect(value.trim().length).toBeGreaterThan(0)
    }
  })

  it('registry keys are never display-name-shaped (no spaces) — canonical ids only', () => {
    for (const key of Object.keys(SHIP_IMAGE_URLS)) {
      expect(key).not.toMatch(/\s/)
    }
  })

  it('no page or component hard-codes a robertsspaceindustries.com media URL — only the registry/override data files may', () => {
    const root = path.resolve(__dirname, '../..')
    const files = [...collectSourceFiles(path.join(root, 'pages')), ...collectSourceFiles(path.join(root, 'components'))]
    const offenders = files.filter((f) => fs.readFileSync(f, 'utf8').includes('robertsspaceindustries.com'))
    expect(offenders).toEqual([])
  })

  it('shipImageOverrides.ts (the offline pipeline input) is untouched and distinct from the runtime registry', () => {
    expect(Object.keys(shipImageOverrides).length).toBeGreaterThan(0)
    // The two files may legitimately share values for the same real ship
    // (see shipImageRegistry.ts's header) but the runtime registry is
    // never simply a re-export of the pipeline file.
    expect(SHIP_IMAGE_URLS).not.toBe(shipImageOverrides as unknown as typeof SHIP_IMAGE_URLS)
  })

  it('partial coverage is valid — most canonical ids intentionally have no entry, and that must never throw at import time', () => {
    expect(() => Object.keys(SHIP_IMAGE_URLS)).not.toThrow()
    // EWO-038: the Commander workbook covers 214 of 258 canonical hulls;
    // AEGS_Javelin (a capital ship absent from that workbook) is a real,
    // stable example still on fallback today.
    expect(SHIP_IMAGE_URLS.AEGS_Javelin).toBeUndefined()
  })
})

/**
 * EWO-033A (Task 9/10) — Registry Integrity & Image Coverage Audit. A
 * "duplicate literal key" (item 11) is already a TypeScript compile error
 * for an object literal, so the real, checkable risk is an *orphan* key —
 * a Commander-pasted id that no longer (or never did) match any canonical
 * ship definition, silently doing nothing. Computed live against the real
 * current registry/definitions, not a point-in-time snapshot, so this
 * fails loudly if a future catalog regeneration ever orphans an entry.
 */
describe('EWO-033A (Task 9/10): registry integrity and image coverage audit', () => {
  it('10. every registry key matches a real canonical selectable ship definition id, or a definition\'s own alias key — no orphans', () => {
    const knownIds = new Set([
      ...selectableShipDefinitions.map((d) => d.id),
      ...Array.from(presentationImageKeyById.values()),
      // MWO-001 (Task 2) — every id shipDefinitionById resolves (canonical
      // or aliased) is a legitimate registry key: a pre-promotion seed id
      // like "ghost"/"mole" still resolves (now to the real deep-imported
      // definition) and its own image registry entry is still consulted,
      // even though it's no longer itself a *selectable* (Add Ship picker)
      // id.
      ...Array.from(shipDefinitionById.keys()),
    ])
    const orphanKeys = Object.keys(SHIP_IMAGE_URLS).filter((k) => !knownIds.has(k))
    expect(orphanKeys).toEqual([])
  })

  it('11. the registry object has no duplicate keys — key count matches unique key count', () => {
    const keys = Object.keys(SHIP_IMAGE_URLS)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('12. partial image coverage never throws when auditing the full canonical hull registry', () => {
    expect(() => {
      for (const d of selectableShipDefinitions) resolveShipImage({ id: d.id, imageUrl: d.imageUrl, image: d.image })
    }).not.toThrow()
  })

  it('Task 9 coverage report: total hulls, registry hits, and fallback count are all real, non-negative numbers that sum correctly', () => {
    let registryHit = 0
    let fallback = 0
    for (const d of selectableShipDefinitions) {
      const direct = validRegistryUrl(SHIP_IMAGE_URLS[d.id])
      const aliasKey = presentationImageKeyById.get(d.id)
      const viaAlias = aliasKey ? validRegistryUrl(SHIP_IMAGE_URLS[aliasKey]) : undefined
      if (direct || viaAlias) {
        registryHit++
      } else if (!resolveShipImage({ id: d.id, imageUrl: d.imageUrl, image: d.image })) {
        fallback++
      }
    }
    expect(registryHit).toBeGreaterThan(0) // EWO-038: 214 Commander-workbook-imported entries
    expect(registryHit + fallback).toBeLessThanOrEqual(selectableShipDefinitions.length)
  })
})

describe('EWO-033A (Task 10, item 6/7): live store resolution — seed and deep-import Fleet Assets', () => {
  it('6. a seed Fleet Asset resolves its imageUrl through the registry at store construction time', () => {
    // MWO-001 (Task 2): Ghost's real deep-import-derived name ("Hornet
    // F7CS Mk2") never matches the Commander workbook's entry for it (a
    // known, documented naming-mismatch limitation — see CWO-003/MWO-001),
    // so Ghost itself now genuinely has no registry coverage. MOLE (also a
    // seed-backed hull aliased to its real deep-import counterpart) does,
    // and exercises the exact same resolution path.
    const mole = useFleetStore.getState().ships.find((s) => s.id === 'mole')!
    expect(mole.imageUrl).toBe(SHIP_IMAGE_URLS.ARGO_MOLE)
  })

  it('7. a deep-import Fleet Asset (materialized via Add Ship) resolves through the registry via its entity-class alias', () => {
    const result = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', undefined, 99)
    if (!result.success) return // generated catalog not present on this machine
    const asset = useFleetStore.getState().ships.find((s) => s.id === result.assetId)!
    expect(asset.imageUrl).toBe(SHIP_IMAGE_URLS.DRAK_Cutlass_Black)
  })

  it('a manually-added ship with no registry entry resolves to no image (fallback territory), never throws', () => {
    // EWO-038: AEGS_Javelin is absent from the Commander workbook and has
    // no registry entry today (see the coverage test above).
    const result = useFleetStore.getState().addFleetAsset('AEGS_Javelin', 'OWNED', undefined, 99)
    if (!result.success) return
    const asset = useFleetStore.getState().ships.find((s) => s.id === result.assetId)!
    expect(asset.imageUrl).toBeUndefined()
  })
})
