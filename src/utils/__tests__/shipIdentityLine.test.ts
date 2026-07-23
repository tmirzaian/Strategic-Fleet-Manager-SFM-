import { describe, it, expect, beforeEach } from 'vitest'
import { resolveShipStockRoleFocus, resolveStockRoleFocusForDefinition, resolveShipEntityClass, formatShipIdentityLine } from '../shipIdentityLine'
import { shipCatalogRecords } from '../../generated/shipCatalog'
import { selectableShipDefinitions } from '../../data/shipDefinitions'
import { useFleetStore } from '../../store/useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

/**
 * EWO-033 (Task 6/7/9) — root cause: `Ship.role` mirrors whichever Build
 * was active at materialization time (see its own doc comment in
 * src/types/index.ts) — it is not stock ship metadata, and for a
 * nicknamed asset it can even embed the display name a second time
 * (fleetAssetMaterializer.ts). `resolveShipStockRoleFocus` instead reads
 * the canonical ShipDefinition.role directly, falling back to Mission
 * M-012's own catalog record (cross-referenced by entity class) when the
 * canonical definition is deep-imported and its own role/career came back
 * empty — a real, honest gap in the raw StarBreaker `root` export
 * envelope for Eclipse, Gladius, and Cutlass Black, confirmed by direct
 * inspection of raw-data/*.json and generated-data/ships.json.
 */
describe('resolveShipStockRoleFocus — EWO-033 (Task 7): source precedence', () => {
  it('15/22. Cutlass Red now resolves via the aliased deep-import definition (MWO-001, Task 2) — "Medical", the authoritative role', () => {
    const { fleetAssets } = useFleetStore.getState()
    expect(resolveShipStockRoleFocus('cutlass-red', fleetAssets)).toBe('Medical')
  })

  it('16/23. 135c now resolves via the aliased deep-import definition (MWO-001, Task 2) — "Light Freight", the authoritative role', () => {
    const { fleetAssets } = useFleetStore.getState()
    expect(resolveShipStockRoleFocus('135c', fleetAssets)).toBe('Light Freight')
  })

  it('17. Cutlass Black (the original seed Fleet Asset) now resolves via the aliased deep-import definition (MWO-001, Task 2) — the same Mission M-012 catalog fallback a freshly Added one uses, never blank', () => {
    const { fleetAssets } = useFleetStore.getState()
    expect(resolveShipStockRoleFocus('cutlass-black', fleetAssets)).toBe('Light Freight / Medium Fighter')
  })

  it('24. a newly Add-Ship\'d Cutlass Black resolves via the Mission M-012 catalog fallback (tier 2) — its own deep-imported definition role is empty', () => {
    if (shipCatalogRecords.length === 0) return
    const result = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', undefined, 99)
    expect(result.success).toBe(true)
    const { fleetAssets } = useFleetStore.getState()
    expect(resolveShipStockRoleFocus(result.assetId!, fleetAssets)).toBe('Light Freight / Medium Fighter')
  })

  it('18. Eclipse resolves via the Mission M-012 catalog fallback once added — the deep-import pipeline genuinely has no role/career text for it', () => {
    if (shipCatalogRecords.length === 0) return
    const result = useFleetStore.getState().addFleetAsset('eclipse-imported', 'OWNED', undefined, 99)
    expect(result.success).toBe(true)
    const { fleetAssets } = useFleetStore.getState()
    expect(resolveShipStockRoleFocus(result.assetId!, fleetAssets)).toBe('Stealth Bomber')
  })

  it('19. Gladius resolves via the Mission M-012 catalog fallback once added', () => {
    if (shipCatalogRecords.length === 0) return
    const result = useFleetStore.getState().addFleetAsset('gladius-imported', 'OWNED', undefined, 99)
    expect(result.success).toBe(true)
    const { fleetAssets } = useFleetStore.getState()
    expect(resolveShipStockRoleFocus(result.assetId!, fleetAssets)).toBe('Light Fighter')
  })

  it('27. an unknown/unresolvable ship id degrades to undefined, never a guessed value', () => {
    const { fleetAssets } = useFleetStore.getState()
    expect(resolveShipStockRoleFocus('not-a-real-ship-id', fleetAssets)).toBeUndefined()
  })

  it('26. never reads Ship.role, Build.role, or a Commander-defined Fleet Profile field — only the canonical ShipDefinition/catalog', () => {
    // Ghost's own materialized Ship.role text ("Stealth Fighter") happens
    // to equal its ShipDefinition.role too, so this alone can't prove
    // independence — the real proof is structural: resolveShipStockRoleFocus
    // never receives a Ship or Build object at all, only a shipId and
    // fleetAssets, so it has no way to read primaryRole/secondaryRole or
    // a Build's own role/category even if it wanted to.
    const { fleetAssets } = useFleetStore.getState()
    expect(resolveShipStockRoleFocus.length).toBe(2)
    expect(resolveShipStockRoleFocus('ghost', fleetAssets)).toBe('Stealth Fighter')
  })
})

describe('formatShipIdentityLine — EWO-033 (Task 7/8): normalized presentation', () => {
  it('20. manufacturer-only has no dangling separator', () => {
    expect(formatShipIdentityLine('Aegis', undefined)).toBe('Aegis')
  })

  it('21. manufacturer plus role renders "Manufacturer · Role"', () => {
    expect(formatShipIdentityLine('Drake', 'Rescue / Medical')).toBe('Drake · Rescue / Medical')
  })

  it('trims whitespace from both segments', () => {
    expect(formatShipIdentityLine('  Origin  ', '  Stealth Shuttle  ')).toBe('Origin · Stealth Shuttle')
  })

  it('an empty-string role is treated the same as undefined — no dangling separator', () => {
    expect(formatShipIdentityLine('Aegis', '')).toBe('Aegis')
    expect(formatShipIdentityLine('Aegis', '   ')).toBe('Aegis')
  })
})

/**
 * EWO-033 (Task 9) — Metadata Coverage Report, computed live against the
 * real, current canonical hull registry (not a point-in-time snapshot) so
 * this test fails loudly if a future catalog regeneration ever regresses
 * coverage. See the EWO-033 final report for the narrative numbers this
 * test independently verifies.
 */
describe('EWO-033 (Task 9): metadata coverage across every canonical hull', () => {
  it('every selectable canonical ship/ground-vehicle definition resolves a real stock role/focus (100% coverage via tier 1 + tier 2)', () => {
    if (shipCatalogRecords.length === 0) return // gitignored catalog not generated locally — not a real gap
    const unresolved = selectableShipDefinitions.filter((d) => !resolveStockRoleFocusForDefinition(d))
    expect(unresolved.map((d) => d.displayName)).toEqual([])
  })

  it('coverage breaks down as expected: nearly every selectable definition is deep-imported (tier 2), with a handful of catalog-only (tier 1) entries newly surfaced by RC-001', () => {
    if (shipCatalogRecords.length === 0) return
    let tier1 = 0
    let tier2 = 0
    for (const d of selectableShipDefinitions) {
      const isDeepImported = d.sourceMetadata.sourceType === 'StarBreaker' && !d.sourceMetadata.sourceFile
      const resolved = resolveStockRoleFocusForDefinition(d)
      expect(resolved).toBeTruthy()
      if (isDeepImported) tier2++
      else tier1++
    }
    // RC-001: fixing the .localization-cache staleness bug surfaced 5 real
    // ships (Grey's Basher + 4 others) that a stale cache had previously
    // hidden entirely — none are deep-imported yet, so they're tier 1
    // (catalog-only) until a future Golden Fleet promotion picks them up.
    // RC-001A: Grey's Basher itself was then promoted (deep-imported),
    // leaving 4.
    expect(tier1).toBe(4)
    expect(tier2).toBeGreaterThan(0)
    expect(tier1 + tier2).toBe(selectableShipDefinitions.length)
  })
})

describe('resolveShipEntityClass — SW-011A: real DataCore entity class resolution', () => {
  it('resolves through the alias to the real entity class, not the alias key or the definition id', () => {
    const { fleetAssets } = useFleetStore.getState()
    // 'cutlass-black' is the seed Fleet Asset's own id, an alias key that
    // resolves to a definition whose OWN id is 'cutlass-black-imported' —
    // the real entity class must come from THAT resolved definition, not
    // from a naive lookup keyed by the alias or by 'cutlass-black' itself.
    expect(resolveShipEntityClass('cutlass-black', fleetAssets)).toBe('DRAK_Cutlass_Black')
  })

  it('returns undefined for an unknown ship id, never a guess', () => {
    const { fleetAssets } = useFleetStore.getState()
    expect(resolveShipEntityClass('totally-unknown-ship-id', fleetAssets)).toBeUndefined()
  })
})
