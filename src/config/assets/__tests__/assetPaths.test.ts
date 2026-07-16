import { describe, it, expect } from 'vitest'
import { assetPath } from '../assetPaths'

describe('Mission M-022: assetPath', () => {
  it('1. produces a root-relative, normalized public URL', () => {
    expect(assetPath('environments/mission-control/background.webp')).toBe('/assets/environments/mission-control/background.webp')
  })

  it('1. collapses duplicate slashes and normalizes backslashes', () => {
    expect(assetPath('environments//mission-control\\\\background.webp')).toBe('/assets/environments/mission-control/background.webp')
  })

  it('1. produces the same result whether the input has a leading slash or not', () => {
    expect(assetPath('branding/logo/mark.svg')).toBe(assetPath('/branding/logo/mark.svg'))
  })

  it('2. rejects path traversal', () => {
    expect(() => assetPath('../secrets.json')).toThrow()
    expect(() => assetPath('environments/../../etc/passwd')).toThrow()
    expect(() => assetPath('environments/mission-control/../../../etc/passwd')).toThrow()
  })

  it('rejects remote/protocol URLs — never accepts an arbitrary remote URL for a local asset', () => {
    expect(() => assetPath('https://example.com/image.png')).toThrow()
    expect(() => assetPath('//example.com/image.png')).toThrow()
  })

  it('rejects an empty or whitespace-only input', () => {
    expect(() => assetPath('')).toThrow()
    expect(() => assetPath('   ')).toThrow()
  })
})
