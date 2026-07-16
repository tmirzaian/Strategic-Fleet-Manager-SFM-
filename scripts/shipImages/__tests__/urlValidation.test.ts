import { describe, it, expect } from 'vitest'
import { validateImageUrl } from '../urlValidation'

describe('validateImageUrl — EWO-038 (Task 2/11)', () => {
  it('accepts a real robertsspaceindustries.com HTTPS URL (the actual workbook host)', () => {
    const result = validateImageUrl('https://robertsspaceindustries.com/i/abc123/resize(910,512,cover)/source.webp')
    expect(result.valid).toBe(true)
  })

  it('accepts the media. subdomain host already used by the existing registry', () => {
    const result = validateImageUrl('https://media.robertsspaceindustries.com/abcxyz/slideshow.jpg')
    expect(result.valid).toBe(true)
  })

  it('rejects a non-HTTPS URL', () => {
    const result = validateImageUrl('http://robertsspaceindustries.com/i/abc/source.webp')
    expect(result.valid).toBe(false)
    expect(result.reasons).toContain('NOT_HTTPS')
  })

  it('rejects a non-RSI host', () => {
    const result = validateImageUrl('https://example.com/i/abc/source.webp')
    expect(result.valid).toBe(false)
    expect(result.reasons).toContain('DISALLOWED_HOST')
  })

  it('rejects a javascript: URL', () => {
    const result = validateImageUrl('javascript:alert(1)')
    expect(result.valid).toBe(false)
  })

  it('rejects a data: URL', () => {
    const result = validateImageUrl('data:image/png;base64,abcd')
    expect(result.valid).toBe(false)
  })

  it('rejects a file: URL', () => {
    const result = validateImageUrl('file:///C:/images/ship.png')
    expect(result.valid).toBe(false)
  })

  it('rejects a bare local/relative path', () => {
    const result = validateImageUrl('/images/ship-placeholder.png')
    expect(result.valid).toBe(false)
    expect(result.reasons).toContain('NOT_ABSOLUTE_URL')
  })

  it('rejects an empty string', () => {
    const result = validateImageUrl('')
    expect(result.valid).toBe(false)
    expect(result.reasons).toEqual(['EMPTY'])
  })

  it('rejects a whitespace-only string', () => {
    const result = validateImageUrl('   ')
    expect(result.valid).toBe(false)
    expect(result.reasons).toEqual(['EMPTY'])
  })

  it('trims surrounding whitespace and still accepts an otherwise-valid URL', () => {
    const result = validateImageUrl('  https://robertsspaceindustries.com/i/abc/source.webp  ')
    expect(result.valid).toBe(true)
    expect(result.trimmed).toBe('https://robertsspaceindustries.com/i/abc/source.webp')
  })
})
