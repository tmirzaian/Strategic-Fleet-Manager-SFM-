import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { useFleetStore } from '../store/useFleetStore'
import { SHIP_IMAGE_URLS } from '../data/shipImageRegistry'
import { comparePriority } from '../utils/fleetPriority'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => {
  cleanup()
  vi.resetModules()
  vi.doUnmock('../data/shipImageRegistry')
})

/**
 * EWO-033A (Task 12) — Manual Commander Validation, driven end-to-end
 * against the real `App` router and the seed fleet's own registry data
 * (Cutlass Black and 135c both have real, registered images). No
 * browser-automation tooling is available in this environment (disclosed
 * consistently across every mission this session) — this substitutes for
 * an actual resized-browser session.
 *
 * EWO-038 note: the Commander RSI workbook import now covers every
 * deep-imported hull (including Eclipse and Gladius), so the fallback
 * scenario below is simulated via `vi.doMock` (temporarily removing one
 * hull's registry entry) rather than relying on a real hull that happens
 * to still be uncovered — that set only shrinks as coverage improves.
 */
describe('EWO-033A (Task 12): Commander flow — ship image coverage and universal fallback', () => {
  it('1-6. Fleet Dashboard and Mission Control show real registered images for Cutlass Black/135c, identically', () => {
    render(
      <MemoryRouter initialEntries={['/fleet']}>
        <App />
      </MemoryRouter>
    )

    // 2. Cutlass Black and 135c display real registered images. Cutlass
    // Black's seed id resolves through its deep-import alias key
    // (DRAK_Cutlass_Black), per EWO-021's canonical-hull ruling.
    const cutlassBlackCard = screen.getByText('Cutlass Black').closest('.panel') as HTMLElement
    const cutlassBlackImg = within(cutlassBlackCard).getByRole('img', { name: 'Cutlass Black' }) as HTMLImageElement
    expect(cutlassBlackImg.src).toBe(SHIP_IMAGE_URLS.DRAK_Cutlass_Black)

    // MWO-001 (Task 2): '135c' now aliases to its real deep-imported
    // definition too — its registry key is the raw entity class
    // (ORIG_135c), same pattern as Cutlass Black above.
    const c135Card = screen.getByText('135c').closest('.panel') as HTMLElement
    const c135Img = within(c135Card).getByRole('img', { name: '135c' }) as HTMLImageElement
    expect(c135Img.src).toBe(SHIP_IMAGE_URLS.ORIG_135c)

    // 4. All cards retain equal dimensions (same shared structural regions).
    const allCards = document.querySelectorAll('.aspect-video')
    const frameClasses = new Set(Array.from(allCards).map((el) => el.className))
    expect(frameClasses.size).toBe(1)
  })

  it('5/6. Mission Control image presentation matches Fleet Dashboard exactly for the same real-image ship', () => {
    render(
      <MemoryRouter initialEntries={['/fleet']}>
        <App />
      </MemoryRouter>
    )
    const { ships } = useFleetStore.getState()
    const topShip = [...ships].sort((a, b) => comparePriority(a.priority, b.priority))[0]
    const fdCard = screen.getByText(topShip.name).closest('.panel') as HTMLElement
    const fdImg = within(fdCard).getByRole('img') as HTMLImageElement
    const fdImgSrc = fdImg.src
    const fdImgClass = fdImg.className
    cleanup()

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    const mcWrapper = screen.getByText('PRIORITY 1').closest('[data-testid="priority-card-wrapper"]') as HTMLElement
    const mcImg = within(mcWrapper).getByRole('img') as HTMLImageElement
    expect(mcImg.src).toBe(fdImgSrc)
    expect(mcImg.className).toBe(fdImgClass)
  })

  it('7-10. Cutlass Black Ship Detail shows a full-bleed real hero; a hull with no registry entry fills the hero via the fallback without excessive unused space', async () => {
    render(
      <MemoryRouter initialEntries={['/ship/cutlass-black']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getByTestId('ship-hero-overlay-info')).toBeInTheDocument()
    const realHero = screen.getByTestId('ship-hero-image-area')
    const realHeroClass = realHero.className
    cleanup()

    // EWO-038: every deep-imported hull (including Eclipse) now has a real
    // Commander-workbook registry entry, so the fallback scenario this test
    // exercises is simulated the same way test 11-13 simulates a bad URL —
    // via vi.doMock — rather than depending on which hull happens to be
    // uncovered today (that set only shrinks as coverage improves).
    vi.resetModules()
    vi.doMock('../data/shipImageRegistry', () => ({
      SHIP_IMAGE_URLS: { ...SHIP_IMAGE_URLS, AEGS_Eclipse: undefined },
    }))
    const { default: NoRegistryApp } = await import('../App')
    render(
      <MemoryRouter initialEntries={['/ship/eclipse-imported']}>
        <NoRegistryApp />
      </MemoryRouter>
    )
    expect(screen.getByTestId('ship-hero-metadata-band')).toBeInTheDocument()
    const fallbackHero = screen.getByTestId('ship-hero-image-area')
    // Same fixed height as the real-photo hero — no "excessive unused space."
    expect(fallbackHero.className).toBe(realHeroClass)
  })

  it('11-13. a temporarily invalid registered URL falls back cleanly on all three surfaces, and restoring the registry brings the real image back', async () => {
    // 11. Simulate a Commander temporarily pasting an invalid (non-HTTPS)
    // URL into src/data/shipImageRegistry.ts, via vi.doMock + a fresh
    // module import — the same "edit the file, reload the page" cycle a
    // real Commander session goes through (a plain in-memory object
    // mutation would not survive vi.resetModules(), which re-reads the
    // real on-disk registry on next import; doMock is the correct way to
    // simulate a source edit within a single test).
    vi.resetModules()
    vi.doMock('../data/shipImageRegistry', () => ({
      SHIP_IMAGE_URLS: { ...SHIP_IMAGE_URLS, DRAK_Cutlass_Black: 'not-a-valid-url' },
    }))
    const { default: MockedApp } = await import('../App')
    render(
      <MemoryRouter initialEntries={['/fleet']}>
        <MockedApp />
      </MemoryRouter>
    )
    const card = screen.getByText('Cutlass Black').closest('.panel') as HTMLElement
    const img = within(card).getByRole('img', { name: 'Cutlass Black' }) as HTMLImageElement
    // 12. Falls back cleanly — never the invalid string, never a crash.
    expect(img.src).not.toContain('not-a-valid-url')
    cleanup()

    // 13. Restore the registry (unmock) and confirm the real image returns.
    vi.doUnmock('../data/shipImageRegistry')
    vi.resetModules()
    const { default: RestoredApp } = await import('../App')
    render(
      <MemoryRouter initialEntries={['/fleet']}>
        <RestoredApp />
      </MemoryRouter>
    )
    const restoredCard = screen.getByText('Cutlass Black').closest('.panel') as HTMLElement
    const restoredImg = within(restoredCard).getByRole('img', { name: 'Cutlass Black' }) as HTMLImageElement
    expect(restoredImg.src).toBe(SHIP_IMAGE_URLS.DRAK_Cutlass_Black)
  })

  it('14-17. adding a real Commander-supplied URL for a previously-unregistered hull takes effect immediately and remains stable after a simulated restart', async () => {
    // EWO-038: Eclipse itself is now covered by the real Commander
    // workbook, so "previously unregistered" is simulated the same way
    // test 7-10 does — this test's own real subject is the mechanism
    // (an edit takes effect immediately and survives a reload), not
    // whether Eclipse specifically still lacks an entry today.
    const registryWithoutEclipse = { ...SHIP_IMAGE_URLS, AEGS_Eclipse: undefined } as Record<string, string | undefined>
    expect(registryWithoutEclipse.AEGS_Eclipse).toBeUndefined()

    // 14/15. Simulate adding one new line to shipImageRegistry.ts, then a
    // normal dev-cycle reload (fresh module + store construction). Uses a
    // real added Fleet Asset (not the developer-only "imported preview"
    // route, which separately carries its own offline import-manifest
    // source/status flag unrelated to this registry) — this is the actual
    // Commander-facing Ship Detail path real owned ships render through.
    vi.resetModules()
    vi.doMock('../data/shipImageRegistry', () => ({
      SHIP_IMAGE_URLS: { ...registryWithoutEclipse, AEGS_Eclipse: 'https://media.robertsspaceindustries.com/test-commander-added/slideshow.jpg' },
    }))
    const { default: FirstApp } = await import('../App')
    const { useFleetStore: firstStore } = await import('../store/useFleetStore')
    const added = firstStore.getState().addFleetAsset('eclipse-imported', 'OWNED')
    expect(added.success).toBe(true)
    render(
      <MemoryRouter initialEntries={[`/ship/${added.assetId}`]}>
        <FirstApp />
      </MemoryRouter>
    )
    expect(screen.getByTestId('ship-hero-overlay-info')).toBeInTheDocument() // now a real image, not the fallback
    cleanup()

    // 16/17. A second, independent reload/restart — resolution remains
    // stable (same mocked registry, fresh store construction again).
    vi.resetModules()
    vi.doMock('../data/shipImageRegistry', () => ({
      SHIP_IMAGE_URLS: { ...SHIP_IMAGE_URLS, AEGS_Eclipse: 'https://media.robertsspaceindustries.com/test-commander-added/slideshow.jpg' },
    }))
    const { default: SecondApp } = await import('../App')
    const { useFleetStore: secondStore } = await import('../store/useFleetStore')
    const addedAgain = secondStore.getState().addFleetAsset('eclipse-imported', 'OWNED')
    render(
      <MemoryRouter initialEntries={[`/ship/${addedAgain.assetId}`]}>
        <SecondApp />
      </MemoryRouter>
    )
    expect(screen.getByTestId('ship-hero-overlay-info')).toBeInTheDocument()
  })
})
