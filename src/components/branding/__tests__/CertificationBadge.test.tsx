import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import CertificationBadge from '../CertificationBadge'
import { CERTIFICATION_BADGES } from '../../../config/assets'

afterEach(() => cleanup())

/**
 * EWO-095B — the reusable certification-seal overlay. Covers: correct
 * asset/alt resolution via the semantic registry (never a hardcoded
 * filename in this component), default overlay positioning/opacity/
 * layering, the `className` override escape hatch, and the
 * missing-asset-never-crashes contract every other semantic asset
 * consumer in this codebase already follows.
 */
describe('<CertificationBadge />', () => {
  it("renders the 'community' seal with its registry src and alt — never a hardcoded filename", () => {
    const { getByAltText } = render(<CertificationBadge variant="community" />)
    const img = getByAltText(CERTIFICATION_BADGES.community.alt) as HTMLImageElement
    expect(img).toBeInTheDocument()
    expect(img.src).toContain(CERTIFICATION_BADGES.community.src)
  })

  it('defaults to an absolutely positioned, vertically centered, right-aligned, fully opaque, non-interactive overlay (EWO-095B Amendment 1)', () => {
    const { getByAltText } = render(<CertificationBadge variant="community" />)
    const img = getByAltText(CERTIFICATION_BADGES.community.alt)
    expect(img.className).toContain('absolute')
    expect(img.className).toContain('right-6')
    // True vertical centering, not corner-anchoring — stays centered as
    // card height changes since the transform is relative to the badge's
    // own rendered height, not a fixed pixel offset from an edge.
    expect(img.className).toContain('top-1/2')
    expect(img.className).toContain('-translate-y-1/2')
    expect(img.className).not.toContain('bottom-[18px]')
    expect(img.className).toContain('pointer-events-none')
    // Fully opaque per EWO-095B Part E — no opacity utility class applied.
    expect(img.className).not.toMatch(/\bopacity-/)
  })

  it('renders ~14-20% larger across responsive tiers than the pre-Amendment-1 sizing (w-16/sm:w-20/md:w-24, up from w-14/sm:w-16/md:w-20)', () => {
    const { getByAltText } = render(<CertificationBadge variant="community" />)
    const img = getByAltText(CERTIFICATION_BADGES.community.alt)
    expect(img.className).toContain('w-16')
    expect(img.className).toContain('sm:w-20')
    expect(img.className).toContain('md:w-24')
  })

  it('sits above the artwork but below foreground text in the default stacking (z-10, less than the CaptainsLog text wrapper’s z-20)', () => {
    const { getByAltText } = render(<CertificationBadge variant="community" />)
    const img = getByAltText(CERTIFICATION_BADGES.community.alt)
    expect(img.className).toContain('z-10')
  })

  it('accepts a className override for a future placement without touching the component', () => {
    const { getByAltText } = render(<CertificationBadge variant="community" className="absolute left-2 top-2 w-10" />)
    const img = getByAltText(CERTIFICATION_BADGES.community.alt)
    expect(img.className).toBe('absolute left-2 top-2 w-10')
  })

  it('renders nothing (never a broken <img>) when the resolved variant has no usable src', () => {
    const original = CERTIFICATION_BADGES.community.enabled
    CERTIFICATION_BADGES.community.enabled = false
    try {
      const { container } = render(<CertificationBadge variant="community" />)
      expect(container).toBeEmptyDOMElement()
    } finally {
      CERTIFICATION_BADGES.community.enabled = original
    }
  })
})
