import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ShipImage from '../ShipImage'

afterEach(() => cleanup())

describe('<ShipImage /> adaptive presentation', () => {
  it('fallback (missing src) renders using object-contain', () => {
    render(<ShipImage alt="Fallback ship" />)
    const img = screen.getByRole('img', { name: 'Fallback ship' })
    expect(img.className).toContain('object-contain')
    expect(img.className).not.toContain('object-cover')
  })

  it('normal image (real src) renders using object-cover', () => {
    render(<ShipImage src="https://example.com/real-ship.jpg" alt="Real ship" />)
    const img = screen.getByRole('img', { name: 'Real ship' })
    expect(img.className).toContain('object-cover')
    expect(img.className).not.toContain('object-contain')
  })

  it('a ship whose metadata says source: FALLBACK renders contain mode even though a src is present', () => {
    render(<ShipImage src="/images/ship-placeholder.png" image={{ source: 'FALLBACK', status: 'fallback' }} alt="Imported ship" />)
    const img = screen.getByRole('img', { name: 'Imported ship' })
    expect(img.className).toContain('object-contain')
  })

  it('a ship with a manual/resolved image metadata renders cover mode', () => {
    render(<ShipImage src="https://example.com/real-ship.jpg" image={{ source: 'MANUAL_OVERRIDE', status: 'manual' }} alt="Approved ship" />)
    const img = screen.getByRole('img', { name: 'Approved ship' })
    expect(img.className).toContain('object-cover')
  })

  it('does not render a dark gradient overlay on top of fallback artwork', () => {
    const { container } = render(<ShipImage alt="Fallback ship" />)
    const overlay = container.querySelector('.bg-gradient-to-t')
    expect(overlay).toBeNull()
  })

  it('does render the overlay for real ship photography by default', () => {
    const { container } = render(<ShipImage src="https://example.com/real-ship.jpg" alt="Real ship" />)
    const overlay = container.querySelector('.bg-gradient-to-t')
    expect(overlay).not.toBeNull()
  })

  it('explicit presentation="contain" forces contain mode regardless of src', () => {
    render(<ShipImage src="https://example.com/real-ship.jpg" alt="Forced contain" presentation="contain" />)
    const img = screen.getByRole('img', { name: 'Forced contain' })
    expect(img.className).toContain('object-contain')
  })

  it('reports the effective presentation mode via onPresentationChange', () => {
    let reportedMode: string | undefined
    render(<ShipImage alt="Fallback ship" onPresentationChange={(mode) => (reportedMode = mode)} />)
    expect(reportedMode).toBe('contain')
  })
})
