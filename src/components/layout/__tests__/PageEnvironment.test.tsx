import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import PageEnvironment from '../PageEnvironment'

describe('Mission M-022: <PageEnvironment />', () => {
  it('5. renders nothing for a disabled environment (every shipped definition except mission-control is disabled, EWO-035)', () => {
    const { container } = render(<PageEnvironment id="fleet-dashboard" />)
    expect(container).toBeEmptyDOMElement()
    cleanup()
  })

  it('5. renders nothing for every still-disabled environment ID in the registry', () => {
    // mission-control and decision-center are intentionally excluded —
    // EWO-035 and UX-003B enabled them with real artwork; see the
    // dedicated "renders the enabled ... environment" tests below.
    const ids = ['fleet-dashboard', 'ship-detail', 'hangar-inventory', 'loadout-manager', 'captain-log'] as const
    for (const id of ids) {
      const { container } = render(<PageEnvironment id={id} />)
      expect(container).toBeEmptyDOMElement()
      cleanup()
    }
  })

  it('EWO-035: renders the enabled mission-control environment with its real Beta artwork background, without throwing', () => {
    const { container } = render(<PageEnvironment id="mission-control" />)
    expect(container).not.toBeEmptyDOMElement()
    const layer = container.querySelector('[data-environment-id="mission-control"]')
    expect(layer).not.toBeNull()
    expect(layer!.querySelector('[style*="mission-control-operations-wall.webp"]')).not.toBeNull()
    cleanup()
  })

  it('UX-003B: renders the enabled decision-center environment with its real artwork background, without throwing', () => {
    const { container } = render(<PageEnvironment id="decision-center" />)
    expect(container).not.toBeEmptyDOMElement()
    const layer = container.querySelector('[data-environment-id="decision-center"]')
    expect(layer).not.toBeNull()
    expect(layer!.querySelector('[style*="decision-center.webp"]')).not.toBeNull()
    cleanup()
  })

  it('does not throw for an unknown/mistyped id at the JS level (defensive — TypeScript already prevents this at compile time)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => render(<PageEnvironment id={'not-a-real-id' as any} />)).not.toThrow()
    cleanup()
  })
})

describe('Mission M-022: <PageEnvironment /> when a definition is enabled with a real source (mocked — every shipped definition is disabled today)', () => {
  afterEach(() => {
    vi.doUnmock('../../../config/assets/environmentAssets')
    vi.resetModules()
    cleanup()
  })

  it('7. is aria-hidden and pointer-events-none; 8. is absolutely positioned so it never affects document flow', async () => {
    vi.resetModules()
    vi.doMock('../../../config/assets/environmentAssets', async () => {
      const actual = await vi.importActual<typeof import('../../../config/assets/environmentAssets')>('../../../config/assets/environmentAssets')
      return {
        ...actual,
        getEnvironmentDefinition: () => ({
          id: 'mission-control',
          label: 'Mission Control',
          sources: { desktop: '/assets/environments/mission-control/background.webp' },
          presentation: { opacity: 0.2, brightness: 1, contrast: 1, saturation: 1, blurPx: 0, position: 'center' },
          enabled: true,
          fallback: 'none',
        }),
        isEnvironmentUsable: () => true,
      }
    })
    const { default: MockedPageEnvironment } = await import('../PageEnvironment')
    const { container } = render(<MockedPageEnvironment id="mission-control" />)

    const layer = container.querySelector('[data-environment-id="mission-control"]')
    expect(layer).not.toBeNull()
    expect(layer!.getAttribute('aria-hidden')).toBe('true')
    expect(layer!.className).toContain('pointer-events-none')
    // Absolute positioning (not fixed/relative/static) is what keeps this
    // layer out of document flow — it only occupies space within its
    // nearest positioned ancestor, never pushing surrounding content.
    expect(layer!.className).toContain('absolute')
    expect(layer!.className).not.toContain('fixed')
  })
})
