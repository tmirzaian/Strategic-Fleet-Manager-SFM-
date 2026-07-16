import { describe, it, expect } from 'vitest'
import { matchShipName } from '../matcher'
import type { CanonicalHullRow } from '../canonicalHulls'

function hull(overrides: Partial<CanonicalHullRow> & Pick<CanonicalHullRow, 'canonicalId' | 'displayName'>): CanonicalHullRow {
  return {
    manufacturer: 'Test Manufacturer',
    sourceType: 'seed',
    bareDisplayName: overrides.displayName,
    registryKey: overrides.canonicalId,
    hasExistingImportedImage: false,
    ...overrides,
  }
}

describe('matchShipName — EWO-038 (Task 4/11): exact and normalized matching', () => {
  it('exact match: workbook name identical to a seed-canonical bare displayName', () => {
    const hulls = [hull({ canonicalId: 'ghost', displayName: 'F7C-S Hornet Ghost Mk II' })]
    const result = matchShipName('F7C-S Hornet Ghost Mk II', hulls, [])
    expect(result).toEqual({ outcome: 'EXACT_NAME', canonicalId: 'ghost' })
  })

  it('normalized match: manufacturer-prefix strip (Crusader A1 Spirit -> A1 Spirit)', () => {
    const hulls = [hull({ canonicalId: 'CRUS_Spirit_A1', displayName: 'Crusader A1 Spirit', bareDisplayName: 'A1 Spirit' })]
    const result = matchShipName('A1 Spirit', hulls, [])
    expect(result).toEqual({ outcome: 'NORMALIZED_NAME', canonicalId: 'CRUS_Spirit_A1' })
  })

  it('normalized match: case and whitespace differences never block a real match', () => {
    const hulls = [hull({ canonicalId: 'ghost', displayName: 'F7C-S  Hornet Ghost Mk II' })]
    const result = matchShipName('f7c-s hornet ghost mk ii', hulls, [])
    expect(result).toEqual({ outcome: 'NORMALIZED_NAME', canonicalId: 'ghost' })
  })

  it('reviewed alias table resolves a known RSI/SFM name gap (A2 Hercules -> A2 Hercules Starlifter) without touching C2/M2', () => {
    const hulls = [
      hull({ canonicalId: 'CRUS_Starlifter_A2', displayName: 'Crusader A2 Hercules Starlifter', bareDisplayName: 'A2 Hercules Starlifter' }),
      hull({ canonicalId: 'CRUS_Starlifter_C2', displayName: 'Crusader C2 Hercules Starlifter', bareDisplayName: 'C2 Hercules Starlifter' }),
      hull({ canonicalId: 'CRUS_Starlifter_M2', displayName: 'Crusader M2 Hercules Starlifter', bareDisplayName: 'M2 Hercules Starlifter' }),
    ]
    expect(matchShipName('A2 Hercules', hulls, [])).toEqual({ outcome: 'NORMALIZED_NAME', canonicalId: 'CRUS_Starlifter_A2' })
    expect(matchShipName('C2 Hercules', hulls, [])).toEqual({ outcome: 'NORMALIZED_NAME', canonicalId: 'CRUS_Starlifter_C2' })
    expect(matchShipName('M2 Hercules', hulls, [])).toEqual({ outcome: 'NORMALIZED_NAME', canonicalId: 'CRUS_Starlifter_M2' })
  })
})

describe('matchShipName — EWO-038 (Task 4/11): legitimate variant separation', () => {
  it('600i Explorer and 600i Touring never collapse into each other', () => {
    const hulls = [
      hull({ canonicalId: 'ORIG_600i_Explorer', displayName: '600i Explorer' }),
      hull({ canonicalId: 'ORIG_600i_Touring', displayName: '600i Touring' }),
    ]
    expect(matchShipName('600i Explorer', hulls, [])).toEqual({ outcome: 'EXACT_NAME', canonicalId: 'ORIG_600i_Explorer' })
    expect(matchShipName('600i Touring', hulls, [])).toEqual({ outcome: 'EXACT_NAME', canonicalId: 'ORIG_600i_Touring' })
  })

  it('Cutlass Black and Cutlass Red never collapse into each other', () => {
    const hulls = [hull({ canonicalId: 'cutlass-black-imported', displayName: 'Cutlass Black' }), hull({ canonicalId: 'cutlass-red', displayName: 'Cutlass Red' })]
    expect(matchShipName('Cutlass Black', hulls, [])).toEqual({ outcome: 'EXACT_NAME', canonicalId: 'cutlass-black-imported' })
    expect(matchShipName('Cutlass Red', hulls, [])).toEqual({ outcome: 'EXACT_NAME', canonicalId: 'cutlass-red' })
  })

  it('Hercules C2 / M2 / A2 remain three distinct hulls, never merged', () => {
    const hulls = [
      hull({ canonicalId: 'CRUS_Starlifter_A2', displayName: 'Crusader A2 Hercules Starlifter', bareDisplayName: 'A2 Hercules Starlifter' }),
      hull({ canonicalId: 'CRUS_Starlifter_C2', displayName: 'Crusader C2 Hercules Starlifter', bareDisplayName: 'C2 Hercules Starlifter' }),
      hull({ canonicalId: 'CRUS_Starlifter_M2', displayName: 'Crusader M2 Hercules Starlifter', bareDisplayName: 'M2 Hercules Starlifter' }),
    ]
    const ids = new Set([
      matchShipName('A2 Hercules', hulls, []).canonicalId,
      matchShipName('C2 Hercules', hulls, []).canonicalId,
      matchShipName('M2 Hercules', hulls, []).canonicalId,
    ])
    expect(ids.size).toBe(3)
  })
})

describe('matchShipName — EWO-038 (Task 4/11): ambiguous and unmatched rejection', () => {
  it('a name matching two distinct canonical hulls is AMBIGUOUS, not a guess', () => {
    const hulls = [hull({ canonicalId: 'a', displayName: 'Same Name' }), hull({ canonicalId: 'b', displayName: 'Same Name' })]
    const result = matchShipName('Same Name', hulls, [])
    expect(result.outcome).toBe('AMBIGUOUS')
    expect(result.candidateIds).toEqual(['a', 'b'])
  })

  it('a name with no canonical counterpart at all is UNMATCHED', () => {
    const hulls = [hull({ canonicalId: 'ghost', displayName: 'F7C-S Hornet Ghost Mk II' })]
    const result = matchShipName('Completely Unknown Ship', hulls, [])
    expect(result).toEqual({ outcome: 'UNMATCHED' })
  })

  it('never uses broad fuzzy matching — a name that is only a substring of a canonical name does not match', () => {
    const hulls = [hull({ canonicalId: 'ghost', displayName: 'F7C-S Hornet Ghost Mk II' })]
    const result = matchShipName('Hornet Ghost', hulls, [])
    expect(result.outcome).toBe('UNMATCHED')
  })
})

describe('matchShipName — EWO-038 (Task 4, tier 3): EXISTING_ALIAS via superseded definitions', () => {
  it('a workbook name matching a superseded (non-selectable) definition redirects to its canonical winner', () => {
    const canonical = [hull({ canonicalId: 'prospector', displayName: 'Prospector' })]
    const aliasLookup = [
      ...canonical,
      hull({ canonicalId: 'MISC_Prospector', displayName: 'MISC Prospector', registryKey: 'prospector' }),
    ]
    const result = matchShipName('MISC Prospector', canonical, aliasLookup)
    expect(result).toEqual({ outcome: 'EXISTING_ALIAS', canonicalId: 'prospector' })
  })
})
