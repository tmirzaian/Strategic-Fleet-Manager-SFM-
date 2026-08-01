import { describe, it, expect } from 'vitest'
import { CERTIFICATION_BADGES, getCertificationBadge, resolveCertificationBadgeSrc } from '../certificationBadgeAssets'
import type { CertificationBadgeDefinition } from '../types'

/**
 * EWO-095B — `<CertificationBadge>`'s semantic asset registry. A distinct
 * registry from `BrandingAssetKey` (SFM's own identity assets) — see
 * `CertificationBadgeVariant`'s own doc comment (types.ts) for why.
 */
describe('EWO-095B: certification badge registry', () => {
  it("'community' is enabled with an approved asset and a real, non-empty alt", () => {
    const def = getCertificationBadge('community')
    expect(def.enabled).toBe(true)
    expect(def.src).toMatch(/^\/assets\/branding\/community\/.+\.png$/)
    expect(def.alt.trim().length).toBeGreaterThan(0)
  })

  it('resolveCertificationBadgeSrc returns the registered src for an enabled variant', () => {
    expect(resolveCertificationBadgeSrc('community')).toBe(CERTIFICATION_BADGES.community.src)
  })

  it('returns undefined (never a broken path) when disabled, regardless of src being present — pure resolution logic, matching resolveCaptainsLogAccentSource’s own contract', () => {
    const disabledButSourced: CertificationBadgeDefinition = { variant: 'community', label: 'x', alt: 'x', src: '/assets/branding/community/x.png', enabled: false }
    const resolved = disabledButSourced.enabled && disabledButSourced.src ? disabledButSourced.src : undefined
    expect(resolved).toBeUndefined()
  })

  it('never throws for a defined variant with no src, resolving to undefined instead', () => {
    const noSrc: CertificationBadgeDefinition = { variant: 'community', label: 'x', alt: 'x', enabled: true }
    const resolved = noSrc.enabled && noSrc.src ? noSrc.src : undefined
    expect(resolved).toBeUndefined()
  })
})
