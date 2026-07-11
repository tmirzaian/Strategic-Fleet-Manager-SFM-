import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ComponentMetadataResolver, buildMetadataMapFromEntries } from '../componentMetadataResolver'

function fixtureCatalog() {
  return {
    records: {
      POWR_AEGS_S01_Regulus_SCItem: {
        entityClass: 'POWR_AEGS_S01_Regulus_SCItem',
        recordName: 'EntityClassDefinition.POWR_AEGS_S01_Regulus_SCItem',
        recordId: '688aab9c-bc62-4774-be7d-065dee7e2187',
        category: 'PowerPlant',
        subtype: 'Power',
        size: 1,
        grade: 3,
        manufacturerRef: 'file://.../scitemmanufacturer.aegs.json',
        localizationKey: '@item_NamePOWR_AEGS_S01_Regulus',
        displayName: null,
      },
    },
  }
}

describe('ComponentMetadataResolver — catalog loading', () => {
  it('resolves a known entity class from an injected catalog', () => {
    const resolver = new ComponentMetadataResolver({ loadCatalog: () => fixtureCatalog() })
    const result = resolver.resolve('POWR_AEGS_S01_Regulus_SCItem')
    expect(result.status).toBe('resolved')
    if (result.status === 'resolved') {
      expect(result.metadata.category).toBe('PowerPlant')
      expect(result.metadata.size).toBe(1)
      expect(result.metadata.grade).toBe(3)
      expect(result.provenance).toBe('catalog')
    }
  })

  it('does not throw when no catalog file exists — treats it as an empty catalog', () => {
    const resolver = new ComponentMetadataResolver({ loadCatalog: () => null })
    const result = resolver.resolve('Anything')
    expect(result.status).toBe('unresolved')
  })
})

describe('ComponentMetadataResolver — cache behavior', () => {
  it('loads the catalog at most once across many resolve() calls', () => {
    let callCount = 0
    const resolver = new ComponentMetadataResolver({
      loadCatalog: () => {
        callCount++
        return fixtureCatalog()
      },
    })
    expect(resolver.isLoaded).toBe(false)
    resolver.resolve('POWR_AEGS_S01_Regulus_SCItem')
    resolver.resolve('POWR_AEGS_S01_Regulus_SCItem')
    resolver.resolve('SomethingElse')
    expect(callCount).toBe(1)
    expect(resolver.isLoaded).toBe(true)
  })

  it('caches the empty result too, without re-invoking the loader', () => {
    let callCount = 0
    const resolver = new ComponentMetadataResolver({
      loadCatalog: () => {
        callCount++
        return null
      },
    })
    resolver.resolve('A')
    resolver.resolve('B')
    expect(callCount).toBe(1)
  })
})

describe('ComponentMetadataResolver — exact lookup only', () => {
  const resolver = new ComponentMetadataResolver({ loadCatalog: () => fixtureCatalog() })

  it('matches the exact key', () => {
    expect(resolver.resolve('POWR_AEGS_S01_Regulus_SCItem').status).toBe('resolved')
  })

  it('does not match a substring of a known key', () => {
    expect(resolver.resolve('Regulus').status).toBe('unresolved')
    expect(resolver.resolve('POWR_AEGS_S01_Regulus').status).toBe('unresolved')
  })

  it('does not match case-insensitively', () => {
    expect(resolver.resolve('powr_aegs_s01_regulus_scitem').status).toBe('unresolved')
  })
})

describe('ComponentMetadataResolver — unresolved entity', () => {
  it('returns an explicit UnresolvedMetadata with a reason, not an exception', () => {
    const resolver = new ComponentMetadataResolver({ loadCatalog: () => fixtureCatalog() })
    const result = resolver.resolve('Nonexistent_Item')
    expect(result).toEqual({
      status: 'unresolved',
      entityClass: 'Nonexistent_Item',
      reason: expect.stringContaining('Nonexistent_Item'),
    })
  })
})

describe('buildMetadataMapFromEntries — duplicate protection', () => {
  it('builds a map from unique entries', () => {
    const map = buildMetadataMapFromEntries([
      ['A', { entityClass: 'A', recordName: 'EntityClassDefinition.A', recordId: 'g1', category: null, subtype: null, size: null, grade: null, manufacturerRef: null, localizationKey: null, displayName: null }],
    ])
    expect(map.size).toBe(1)
  })

  it('throws when the same exact entity key appears twice', () => {
    const record = { entityClass: 'A', recordName: 'EntityClassDefinition.A', recordId: 'g1', category: null, subtype: null, size: null, grade: null, manufacturerRef: null, localizationKey: null, displayName: null }
    expect(() => buildMetadataMapFromEntries([['A', record], ['A', record]])).toThrow(/duplicate exact entity key "A"/)
  })
})

describe('ComponentMetadataResolver — deterministic behavior', () => {
  it('returns the same resolution shape for the same entity class across repeated calls', () => {
    const resolver = new ComponentMetadataResolver({ loadCatalog: () => fixtureCatalog() })
    const first = resolver.resolve('POWR_AEGS_S01_Regulus_SCItem')
    const second = resolver.resolve('POWR_AEGS_S01_Regulus_SCItem')
    expect(first).toEqual(second)
  })
})

describe('ComponentMetadataResolver — no catalog mutation', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
  })

  it('never writes back to the catalog file on disk, across many lookups', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sfm-resolver-test-'))
    tempDirs.push(dir)
    const catalogPath = join(dir, 'component-metadata-catalog.json')
    const originalContents = JSON.stringify(fixtureCatalog())
    writeFileSync(catalogPath, originalContents, 'utf-8')
    const beforeMtime = statSync(catalogPath).mtimeMs

    const resolver = new ComponentMetadataResolver({ catalogPath })
    resolver.resolve('POWR_AEGS_S01_Regulus_SCItem')
    resolver.resolve('POWR_AEGS_S01_Regulus_SCItem')
    resolver.resolve('Nonexistent_Item')

    expect(readFileSync(catalogPath, 'utf-8')).toBe(originalContents)
    expect(statSync(catalogPath).mtimeMs).toBe(beforeMtime)
  })
})
