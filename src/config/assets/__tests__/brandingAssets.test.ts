import { describe, it, expect } from 'vitest'
import { BRANDING_ASSETS, getBrandingAsset, resolveBrandingSrc } from '../brandingAssets'
import type { BrandingAssetKey } from '../types'

describe('Mission M-022: branding asset registry', () => {
  const keys: BrandingAssetKey[] = ['primaryLogo', 'compactMark', 'monochromeMark', 'appIcon']

  it('11. every semantic branding key resolves deterministically to a definition', () => {
    for (const key of keys) {
      const def = getBrandingAsset(key)
      expect(def.key).toBe(key)
      expect(typeof def.label).toBe('string')
      expect(def.label.length).toBeGreaterThan(0)
    }
  })

  it('11. resolving the same key twice returns the same result (pure, deterministic)', () => {
    expect(resolveBrandingSrc('primaryLogo')).toBe(resolveBrandingSrc('primaryLogo'))
  })

  it('primaryLogo, monochromeMark, and appIcon remain disabled — no approved artwork yet', () => {
    for (const key of ['primaryLogo', 'monochromeMark', 'appIcon'] as BrandingAssetKey[]) {
      expect(BRANDING_ASSETS[key].enabled).toBe(false)
      expect(resolveBrandingSrc(key)).toBeUndefined()
    }
  })

  it('EWO-004: compactMark is enabled with the approved commissioning logo, resolved through assetPath (never a raw string)', () => {
    expect(BRANDING_ASSETS.compactMark.enabled).toBe(true)
    const src = resolveBrandingSrc('compactMark')
    expect(src).toBe('/assets/branding/logo/sfm-logo-64.png')
  })
})
