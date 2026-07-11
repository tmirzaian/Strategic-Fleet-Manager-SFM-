import { describe, it, expect } from 'vitest'
import { parseBuildManifest, compareCatalogFreshness } from '../buildManifest'

const VALID_MANIFEST_JSON = JSON.stringify({
  Data: {
    Branch: 'sc-alpha-4.8.0',
    BuildDateStamp: 'Mon Jun 29 2026',
    BuildId: 'None',
    BuildTimeStamp: '05:12:19 PM CST',
    Config: 'shipping',
    Platform: 'pc',
    RequestedP4ChangeNum: '12122953',
    Shelved_Change: '',
    Tag: 'public',
    Version: '4.8.184.64329',
  },
})

describe('parseBuildManifest — build metadata parsing', () => {
  it('parses branch/version/p4ChangeNum from a real-shaped manifest', () => {
    const manifest = parseBuildManifest(VALID_MANIFEST_JSON)
    expect(manifest).toEqual({
      branch: 'sc-alpha-4.8.0',
      version: '4.8.184.64329',
      requestedP4ChangeNum: '12122953',
      buildDateStamp: 'Mon Jun 29 2026',
      tag: 'public',
      config: 'shipping',
      platform: 'pc',
    })
  })

  it('throws on unparseable JSON', () => {
    expect(() => parseBuildManifest('{ not json')).toThrow(/Unreadable\/malformed build manifest JSON/)
  })

  it('throws when the top-level Data object is missing', () => {
    expect(() => parseBuildManifest(JSON.stringify({ NotData: {} }))).toThrow(/missing top-level "Data" object/)
  })

  it('throws when Branch is missing', () => {
    const bad = JSON.stringify({ Data: { Version: '1', RequestedP4ChangeNum: '1' } })
    expect(() => parseBuildManifest(bad)).toThrow(/Data\.Branch/)
  })

  it('throws when Version is missing', () => {
    const bad = JSON.stringify({ Data: { Branch: 'b', RequestedP4ChangeNum: '1' } })
    expect(() => parseBuildManifest(bad)).toThrow(/Data\.Version/)
  })

  it('throws when RequestedP4ChangeNum is missing', () => {
    const bad = JSON.stringify({ Data: { Branch: 'b', Version: '1' } })
    expect(() => parseBuildManifest(bad)).toThrow(/Data\.RequestedP4ChangeNum/)
  })
})

describe('compareCatalogFreshness — catalog staleness comparison', () => {
  const currentManifest = parseBuildManifest(VALID_MANIFEST_JSON)

  it('returns "current" when branch/version/p4ChangeNum all match', () => {
    const result = compareCatalogFreshness(
      { gameBranch: 'sc-alpha-4.8.0', gameVersion: '4.8.184.64329', p4ChangeNum: '12122953' },
      currentManifest
    )
    expect(result).toBe('current')
  })

  it('returns "stale" when the version differs', () => {
    const result = compareCatalogFreshness(
      { gameBranch: 'sc-alpha-4.8.0', gameVersion: '4.8.100.11111', p4ChangeNum: '11111111' },
      currentManifest
    )
    expect(result).toBe('stale')
  })

  it('returns "stale" when the branch differs (e.g. catalog built from PTU)', () => {
    const result = compareCatalogFreshness(
      { gameBranch: 'sc-alpha-4.8.0-ptu', gameVersion: '4.8.184.64329', p4ChangeNum: '12122953' },
      currentManifest
    )
    expect(result).toBe('stale')
  })

  it('returns "unverifiable" when the catalog source is missing', () => {
    expect(compareCatalogFreshness(null, currentManifest)).toBe('unverifiable')
    expect(compareCatalogFreshness(undefined, currentManifest)).toBe('unverifiable')
  })

  it('returns "unverifiable" when the current manifest is missing', () => {
    expect(compareCatalogFreshness({ gameBranch: 'b', gameVersion: 'v', p4ChangeNum: 'p' }, null)).toBe('unverifiable')
  })

  it('returns "unverifiable" when the catalog source has an empty required field', () => {
    const result = compareCatalogFreshness({ gameBranch: '', gameVersion: '4.8.184.64329', p4ChangeNum: '12122953' }, currentManifest)
    expect(result).toBe('unverifiable')
  })
})
