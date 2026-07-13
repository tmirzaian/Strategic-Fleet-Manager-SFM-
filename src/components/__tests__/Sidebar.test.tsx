import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
  it('renders the approved commissioning logo (EWO-003 deterministic branding output) in the identity area, resolved at a resolution matching its enlarged display size (EWO-014A)', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    expect(logo.tagName).toBe('IMG')
    expect(logo.getAttribute('src')).toBe('/assets/branding/logo/sfm-logo-256.png')
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

describe('<Sidebar /> — EWO-011 identity lockup (final standard)', () => {
  it('renders the approved hierarchy: mark, SFM principal wordmark, Strategic Fleet Manager descriptor, subordinate version', () => {
    renderSidebar()
    expect(screen.getByAltText('Strategic Fleet Manager')).toBeInTheDocument()
    expect(screen.getByText('SFM')).toBeInTheDocument()
    expect(screen.getByText('Strategic Fleet Manager')).toBeInTheDocument()
  })

  it('renders the slogan with semantic per-phrase coloring (Prepare in amber, Succeed in green)', () => {
    renderSidebar()
    const prepare = screen.getByText('Prepare')
    const succeed = screen.getByText('Succeed')
    expect(prepare.className).toContain('text-warning')
    expect(succeed.className).toContain('text-success')
  })

  it('does not render a duplicate Update Budget / status strip in the sidebar', () => {
    renderSidebar()
    expect(screen.queryByText(/Update Budget/)).not.toBeInTheDocument()
  })

  it('20. every existing navigation route remains present and unchanged', () => {
    renderSidebar()
    const expectedRoutes = ['/', '/fleet', '/ship/ghost', '/loadout-manager', '/hangar', '/quick-update', '/decision-center', '/roadmap', '/log']
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    for (const route of expectedRoutes) {
      expect(hrefs).toContain(route)
    }
  })
})

describe('<Sidebar /> — EWO-014 brand lockup refinement', () => {
  it('renders the slogan with the approved four-color treatment: Plan cyan, Outfit gold, Prepare orange/amber, Succeed green', () => {
    renderSidebar()
    expect(screen.getByText('Plan').className).toContain('text-cyan')
    expect(screen.getByText('Outfit').className).toContain('text-gold')
    expect(screen.getByText('Prepare').className).toContain('text-warning')
    expect(screen.getByText('Succeed').className).toContain('text-success')
  })

  it('the brand lockup reads as its own floating console — a bordered panel distinct from the sidebar background, matching the navigation console treatment', () => {
    renderSidebar()
    const brandConsole = screen.getByText('SFM').closest('div.rounded-lg') as HTMLElement
    expect(brandConsole).not.toBeNull()
    expect(brandConsole.className).toContain('border')
  })

  it('navigation is unchanged: every route link and label still renders exactly as before', () => {
    renderSidebar()
    expect(screen.getByText('Mission Control')).toBeInTheDocument()
    expect(screen.getByText('Fleet Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Loadout Manager')).toBeInTheDocument()
    expect(screen.getByText("Captain's Log")).toBeInTheDocument()
  })
})

describe('<Sidebar /> — EWO-014A corrected commissioning-mark resolution', () => {
  it('resolves the commissioning mark through the semantic sidebarCommissioningMark key, at the 256px derivative', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    expect(logo.getAttribute('src')).toBe('/assets/branding/logo/sfm-logo-256.png')
  })

  it('does not hard-code a raw asset path in Sidebar.tsx — the source resolves only through resolveBrandingSrc', () => {
    const sourcePath = resolve(process.cwd(), 'src/components/Sidebar.tsx')
    const source = readFileSync(sourcePath, 'utf-8')
    expect(source).not.toMatch(/\/assets\/branding/)
    expect(source).not.toMatch(/sfm-logo/)
    expect(source).toContain("resolveBrandingSrc('sidebarCommissioningMark')")
  })

  it('the enlarged mark keeps its approved ~72px display box and object-contain sizing — only the source resolution changed', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    expect(logo.className).toContain('w-[72px]')
    expect(logo.className).toContain('h-[72px]')
    expect(logo.className).toContain('object-contain')
  })

  it('identity text and routes remain unchanged alongside the corrected mark resolution', () => {
    renderSidebar()
    expect(screen.getByText('SFM')).toBeInTheDocument()
    expect(screen.getByText('Strategic Fleet Manager')).toBeInTheDocument()
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(9)
  })
})
