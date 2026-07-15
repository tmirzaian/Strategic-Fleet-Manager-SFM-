import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import ShipImage from '../ShipImage'
import { SHIP_PLACEHOLDER_URL } from '../../constants/shipImage'

afterEach(() => cleanup())

/**
 * EWO-033A (Task 4) corrected the fallback presentation from
 * `object-contain` (letterboxed inside a flat-color background — the
 * exact cause of Sea Trials' "oversized blank hero region" finding) to a
 * centered `object-cover` crop, the same frame-filling treatment real
 * photography already used. The fallback artwork's own text/silhouette
 * were confirmed (direct visual inspection) to survive any reasonable
 * cover-crop. `mode` (`'contain'` vs `'cover'`) remains the semantic
 * fallback-vs-real flag callers react to via `onPresentationChange` — only
 * the fallback branch's *rendered CSS* changed, not the flag's name/value.
 */
describe('<ShipImage /> adaptive presentation', () => {
  it('fallback (missing src) fills the frame with a centered object-cover crop, not letterboxed object-contain', () => {
    render(<ShipImage alt="Fallback ship" />)
    const img = screen.getByRole('img', { name: 'Fallback ship' })
    expect(img.className).toContain('object-cover')
    expect(img.className).not.toContain('object-contain')
  })

  it('the fallback still plays its fade-in transition on first appearance', () => {
    render(<ShipImage alt="Fallback ship" />)
    const img = screen.getByRole('img', { name: 'Fallback ship' })
    expect(img.className).toContain('animate-ship-image-fade-in')
  })

  it('normal image (real src) renders using object-cover', () => {
    render(<ShipImage src="https://example.com/real-ship.jpg" alt="Real ship" />)
    const img = screen.getByRole('img', { name: 'Real ship' })
    expect(img.className).toContain('object-cover')
    expect(img.className).not.toContain('object-contain')
  })

  it('a ship whose metadata says source: FALLBACK still fills the frame via object-cover even though a src is present', () => {
    render(<ShipImage src="/images/ship-placeholder.png" image={{ source: 'FALLBACK', status: 'fallback' }} alt="Imported ship" />)
    const img = screen.getByRole('img', { name: 'Imported ship' })
    expect(img.className).toContain('object-cover')
    expect(img.className).toContain('animate-ship-image-fade-in')
  })

  it('a ship with a manual/resolved image metadata renders cover mode', () => {
    render(<ShipImage src="https://example.com/real-ship.jpg" image={{ source: 'MANUAL_OVERRIDE', status: 'manual' }} alt="Approved ship" />)
    const img = screen.getByRole('img', { name: 'Approved ship' })
    expect(img.className).toContain('object-cover')
  })

  it('does not render a dark gradient overlay on top of fallback artwork — its own text stays fully legible', () => {
    const { container } = render(<ShipImage alt="Fallback ship" />)
    const overlay = container.querySelector('.bg-gradient-to-t')
    expect(overlay).toBeNull()
  })

  it('does render the overlay for real ship photography by default', () => {
    const { container } = render(<ShipImage src="https://example.com/real-ship.jpg" alt="Real ship" />)
    const overlay = container.querySelector('.bg-gradient-to-t')
    expect(overlay).not.toBeNull()
  })

  it('explicit presentation="contain" still forces fallback (frame-filling cover, no overlay) mode regardless of src', () => {
    render(<ShipImage src="https://example.com/real-ship.jpg" alt="Forced contain" presentation="contain" />)
    const img = screen.getByRole('img', { name: 'Forced contain' })
    expect(img.className).toContain('object-cover')
    expect(img.className).toContain('animate-ship-image-fade-in')
  })

  it('reports the effective presentation mode via onPresentationChange', () => {
    let reportedMode: string | undefined
    render(<ShipImage alt="Fallback ship" onPresentationChange={(mode) => (reportedMode = mode)} />)
    expect(reportedMode).toBe('contain')
  })

  it('no longer applies a flat background-color box behind the fallback image — object-cover fills the frame with no letterbox to reveal', () => {
    const { container } = render(<ShipImage alt="Fallback ship" className="test-frame" />)
    const frame = container.querySelector('.test-frame') as HTMLElement
    expect(frame.style.backgroundColor).toBe('')
  })
})

/**
 * EWO-033A (Task 7/10/11) — a registered URL that fails to load at
 * runtime (a real 404/network failure, simulated here via a genuine
 * `error` event on the `<img>` element itself — the same event a real
 * browser fires — not just the underlying pure state-machine function
 * these events delegate to, which src/utils/__tests__/shipImageState.test.ts
 * already covers independently).
 */
describe('<ShipImage /> — EWO-033A (Task 7): failed URL degrades cleanly', () => {
  it('9/18/19. a failing registered URL switches to the universal fallback, filling the frame via object-cover, with no broken-image state left behind', () => {
    render(<ShipImage src="https://example.com/this-will-fail.jpg" alt="Failing ship" />)
    const img = screen.getByRole('img', { name: 'Failing ship' })
    expect(img).toHaveAttribute('src', 'https://example.com/this-will-fail.jpg')

    fireEvent.error(img)

    const fallbackImg = screen.getByRole('img', { name: 'Failing ship' })
    expect(fallbackImg).toHaveAttribute('src', SHIP_PLACEHOLDER_URL)
    expect(fallbackImg.className).toContain('object-cover')
  })

  it('a failed load never crashes the component and never leaves a broken <img> with an empty/invalid src', () => {
    render(<ShipImage src="https://example.com/this-will-fail.jpg" alt="Failing ship" />)
    const img = screen.getByRole('img', { name: 'Failing ship' })
    expect(() => fireEvent.error(img)).not.toThrow()
    expect(screen.getByRole('img', { name: 'Failing ship' })).toHaveAttribute('src', SHIP_PLACEHOLDER_URL)
  })

  it('even the fallback asset itself failing to load degrades to the neutral icon treatment, never a loop, never a crash', () => {
    render(<ShipImage src="https://example.com/this-will-fail.jpg" alt="Failing ship" />)
    const img = screen.getByRole('img', { name: 'Failing ship' })
    fireEvent.error(img) // first failure -> switches to fallback
    const fallbackImg = screen.getByRole('img', { name: 'Failing ship' })
    expect(() => fireEvent.error(fallbackImg)).not.toThrow() // fallback also fails
    expect(screen.queryByRole('img', { name: 'Failing ship' })).not.toBeInTheDocument() // no more <img> — neutral icon instead
  })
})
