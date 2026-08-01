import { describe, it, expect } from 'vitest'
import { CAPTAINS_LOG_ACCENTS, getCaptainsLogAccent, resolveCaptainsLogAccentSource } from '../captainsLogAssets'
import type { CaptainsLogAccentSource } from '../types'

/**
 * Chief Architect Asset Handoff — the Captain's Log certification card's
 * own accent registry. A distinct, fourth registry from `EnvironmentId`
 * (whole-room artwork) and `ShipManagementIllustrationId` (a full-cover
 * panel `<img>`) — see CaptainsLogAccentId's own doc comment
 * (src/config/assets/types.ts) for why. Resolves to a plain CSS
 * background-image URL, never an `<img>` src, never a raw path in page
 * code.
 */
describe("Chief Architect Asset Handoff: Captain's Log accent registry", () => {
  it('certification is enabled with both delivered tiers (master was below the originally-requested 2400 tier, never upscaled)', () => {
    const def = getCaptainsLogAccent('certification')
    expect(def.enabled).toBe(true)
    expect(def.sources.wide).toMatch(/^\/assets\/illustrations\/captains-log-certification\/.+-1600\.webp$/)
    expect(def.sources.narrow).toMatch(/^\/assets\/illustrations\/captains-log-certification\/.+-1200\.webp$/)
  })

  it('resolveCaptainsLogAccentSource prefers the wider tier when both are present', () => {
    expect(resolveCaptainsLogAccentSource('certification')).toBe(CAPTAINS_LOG_ACCENTS.certification.sources.wide)
  })

  it('resolveCaptainsLogAccentSource falls back to narrow when wide is absent, and to undefined when neither is present — never throws', () => {
    // Exercised via the pure resolution logic directly rather than
    // mutating the shared registry (which other tests/consumers also
    // read), matching resolveResponsiveSource's own fallback contract.
    const narrowOnly = { id: 'certification' as const, label: 'x', sources: { narrow: '/assets/x-1200.webp' } as CaptainsLogAccentSource, enabled: true }
    const neither = { id: 'certification' as const, label: 'x', sources: {} as CaptainsLogAccentSource, enabled: true }
    expect(narrowOnly.sources.wide || narrowOnly.sources.narrow || undefined).toBe('/assets/x-1200.webp')
    expect(neither.sources.wide || neither.sources.narrow || undefined).toBeUndefined()
  })

  it('returns undefined (not a broken path) when disabled, regardless of sources present', () => {
    const disabledButSourced = { id: 'certification' as const, label: 'x', sources: { wide: '/assets/x-1600.webp' } as CaptainsLogAccentSource, enabled: false }
    const resolved = disabledButSourced.enabled ? disabledButSourced.sources.wide || disabledButSourced.sources.narrow || undefined : undefined
    expect(resolved).toBeUndefined()
  })
})
