import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import EnvironmentBay from '../EnvironmentBay'

afterEach(() => cleanup())

/**
 * Chief Architect Asset Handoff — `EnvironmentBay` gained an optional
 * `minHeightClassName` prop so a compact sub-panel (Mission Control's
 * "No Vessels Assigned" card) doesn't have to take on the standard 560px
 * department-room height every existing bay (Decision Center) uses.
 * Composition itself was already covered indirectly via Decision
 * Center's own tests (UI_ARCHITECTURE.md §56); this file covers only the
 * new prop's own behavior.
 */
describe('EnvironmentBay — minHeightClassName (Chief Architect Asset Handoff)', () => {
  it('defaults to the standard 560px department-room height when omitted', () => {
    const { container } = render(
      <EnvironmentBay id="decision-center">
        <div>content</div>
      </EnvironmentBay>
    )
    const bay = container.firstElementChild as HTMLElement
    expect(bay.className).toContain('lg:min-h-[560px]')
  })

  it('uses the override height when a compact sub-panel supplies one, and never also renders the 560px default', () => {
    const { container } = render(
      <EnvironmentBay id="mission-control-empty-priority" minHeightClassName="lg:min-h-[300px]">
        <div>content</div>
      </EnvironmentBay>
    )
    const bay = container.firstElementChild as HTMLElement
    expect(bay.className).toContain('lg:min-h-[300px]')
    expect(bay.className).not.toContain('lg:min-h-[560px]')
  })

  it('still renders children regardless of the height override', () => {
    const { getByText } = render(
      <EnvironmentBay id="hangar-inventory-empty" minHeightClassName="lg:min-h-[300px]">
        <p>No Inventory Recorded</p>
      </EnvironmentBay>
    )
    expect(getByText('No Inventory Recorded')).toBeInTheDocument()
  })
})

/**
 * Chief Architect Asset Handoff (Revision 2) — `vignetteOpacity` lets a
 * caller reduce or remove the bay's own edge-darkening radial gradient
 * (reviewed against the higher-resolution masters) without touching
 * Decision Center's own already-approved 0.92 value.
 */
describe('EnvironmentBay — vignetteOpacity (Chief Architect Asset Handoff, Revision 2)', () => {
  function vignetteLayer(container: HTMLElement): HTMLElement | null {
    return container.querySelector('[style*="radial-gradient"]')
  }

  it('defaults to 0.92 (Decision Center\'s own unchanged value) when omitted', () => {
    const { container } = render(
      <EnvironmentBay id="decision-center">
        <div>content</div>
      </EnvironmentBay>
    )
    const layer = vignetteLayer(container)
    expect(layer).not.toBeNull()
    expect(layer!.style.background).toMatch(/rgba\(7,\s*16,\s*22,\s*0\.92\)/)
  })

  it('uses a reduced opacity when a caller supplies one', () => {
    const { container } = render(
      <EnvironmentBay id="mission-control-empty-priority" vignetteOpacity={0.45}>
        <div>content</div>
      </EnvironmentBay>
    )
    const layer = vignetteLayer(container)
    expect(layer).not.toBeNull()
    expect(layer!.style.background).toMatch(/rgba\(7,\s*16,\s*22,\s*0\.45\)/)
  })

  it('renders no vignette layer at all when opacity is 0 — not a transparent no-op div', () => {
    const { container } = render(
      <EnvironmentBay id="fleet-dashboard-empty" vignetteOpacity={0}>
        <div>content</div>
      </EnvironmentBay>
    )
    expect(vignetteLayer(container)).toBeNull()
  })
})
