import { describe, it, expect } from 'vitest'
import { resolveDisplayImageUrl, resolveShipImage, validRegistryUrl } from '../resolveShipImage'
import { SHIP_PLACEHOLDER_URL } from '../../constants/shipImage'
import { SHIP_IMAGE_URLS } from '../../data/shipImageRegistry'
import { shipCatalogRecords } from '../../generated/shipCatalog'

describe('resolveDisplayImageUrl', () => {
  it('prefers structured image.primaryUrl when present', () => {
    const url = resolveDisplayImageUrl({ image: { primaryUrl: 'https://example.com/primary.jpg' }, imageUrl: 'https://example.com/legacy.jpg' })
    expect(url).toBe('https://example.com/primary.jpg')
  })

  it('falls back to legacy imageUrl when no structured image is present', () => {
    const url = resolveDisplayImageUrl({ imageUrl: 'https://example.com/legacy.jpg' })
    expect(url).toBe('https://example.com/legacy.jpg')
  })

  it('falls back to the local placeholder when neither is present', () => {
    const url = resolveDisplayImageUrl({})
    expect(url).toBe(SHIP_PLACEHOLDER_URL)
  })

  it('treats an empty-string primaryUrl as absent and falls through to imageUrl', () => {
    const url = resolveDisplayImageUrl({ image: { primaryUrl: '' }, imageUrl: 'https://example.com/legacy.jpg' })
    expect(url).toBe('https://example.com/legacy.jpg')
  })
})

describe('EWO-021A: resolveShipImage', () => {
  // MWO-001 (Task 2): Ghost's real deep-import-derived name never matches
  // the Commander workbook's entry for it (a documented naming-mismatch
  // limitation), so Ghost itself now genuinely has no registry coverage.
  // Prospector (also a seed-backed hull aliased to its real deep-import
  // counterpart) does, and exercises the exact same resolution path.
  it('1. resolves a registry URL for a canonical seed id', () => {
    expect(resolveShipImage({ id: 'prospector' })).toBe(SHIP_IMAGE_URLS.MISC_Prospector)
  })

  it('2. a registry URL overrides the input\'s own existing definition/generated image', () => {
    const url = resolveShipImage({ id: 'prospector', imageUrl: 'https://example.com/some-other-photo.jpg' })
    expect(url).toBe(SHIP_IMAGE_URLS.MISC_Prospector)
    expect(url).not.toBe('https://example.com/some-other-photo.jpg')
  })

  it('4. a malformed (non-HTTPS) registry entry is rejected by the validator, whitespace-only entries too', () => {
    expect(validRegistryUrl('/local/relative/path.png')).toBeUndefined()
    expect(validRegistryUrl('http://example.com/insecure.jpg')).toBeUndefined()
    expect(validRegistryUrl('   ')).toBeUndefined()
    expect(validRegistryUrl(undefined)).toBeUndefined()
    expect(validRegistryUrl('  https://example.com/ok.jpg  ')).toBe('https://example.com/ok.jpg')
  })

  it('5. a ship with no registry entry and no existing image falls through to undefined (placeholder territory)', () => {
    expect(resolveShipImage({ id: 'totally-unregistered-ship-id' })).toBeUndefined()
  })

  it('5b. a ship with no registry entry but a real existing image still resolves that image (tier 2)', () => {
    expect(resolveShipImage({ id: 'totally-unregistered-ship-id', imageUrl: 'https://example.com/legacy.jpg' })).toBe('https://example.com/legacy.jpg')
  })

  it('7/8. Cutlass Black resolves its registry image via either its generated id or its raw entity class (legacy alias)', () => {
    if (shipCatalogRecords.length === 0) return // generated data not present on this machine
    const byGeneratedId = resolveShipImage({ id: 'cutlass-black-imported' })
    const byEntityClass = resolveShipImage({ id: 'DRAK_Cutlass_Black' })
    expect(byGeneratedId).toBe(SHIP_IMAGE_URLS.DRAK_Cutlass_Black)
    expect(byEntityClass).toBe(SHIP_IMAGE_URLS.DRAK_Cutlass_Black)
  })

  it('12. partial registry coverage does not throw for a canonical hull with no entry (e.g. Javelin — absent from the Commander RSI workbook, EWO-038)', () => {
    expect(() => resolveShipImage({ id: 'AEGS_Javelin' })).not.toThrow()
    expect(resolveShipImage({ id: 'AEGS_Javelin' })).toBeUndefined()
  })
})
