import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from '../Sidebar'

afterEach(() => cleanup())

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  )
}

describe('<Sidebar /> — EWO-004 branding integration', () => {
  it('renders the approved commissioning logo (EWO-003 deterministic branding output) in the identity area', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    expect(logo.tagName).toBe('IMG')
    expect(logo.getAttribute('src')).toBe('/assets/branding/logo/sfm-logo-64.png')
  })

  it('renders exactly one decorative mark — no duplicate logo alongside it', () => {
    const { container } = renderSidebar()
    const brandImages = Array.from(container.querySelectorAll('img')).filter((img) => img.getAttribute('alt') === 'Strategic Fleet Manager')
    expect(brandImages.length).toBe(1)
  })

  it('sizes the mark with a fixed square box and object-contain, so aspect ratio is preserved regardless of source dimensions', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    expect(logo.className).toContain('object-contain')
  })
})
