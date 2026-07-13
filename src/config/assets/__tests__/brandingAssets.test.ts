import { describe, it, expect } from 'vitest'
import { BRANDING_ASSETS, getBrandingAsset, resolveBrandingSrc } from '../brandingAssets'
import type { BrandingAssetKey } from '../types'

describe('Mission M-022: branding asset registry', () => {
  const keys: BrandingAssetKey[] = ['primaryLogo', 'compactMark', 'sidebarCommissioningMark', 'monochromeMark', 'appIcon']

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

  it('EWO-014A: sidebarCommissioningMark is enabled and resolves to the 256px derivative — never the compact 64px asset upscaled, never the 1024px master', () => {
    expect(BRANDING_ASSETS.sidebarCommissioningMark.enabled).toBe(true)
    const src = resolveBrandingSrc('sidebarCommissioningMark')
    expect(src).toBe('/assets/branding/logo/sfm-logo-256.png')
  })

  it('EWO-014A: compactMark and sidebarCommissioningMark remain distinct keys resolving to different derivatives, so a future compact (16-64px) use case is unaffected', () => {
    expect(resolveBrandingSrc('compactMark')).not.toBe(resolveBrandingSrc('sidebarCommissioningMark'))
  })
})
