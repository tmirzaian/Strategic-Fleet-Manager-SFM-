import { describe, it, expect } from 'vitest'
import { resolveDisplayImageUrl } from '../resolveShipImage'
import { SHIP_PLACEHOLDER_URL } from '../../constants/shipImage'

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
