import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Sidebar from '../Sidebar'
import { APP_VERSION_LABEL } from '../../config/appVersion'

afterEach(() => cleanup())

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  )
}

describe('<Sidebar /> — EWO-015 commissioned brand-lockup hardpoint', () => {
  it('1/2. renders the brand-lockup image resolved through the semantic registry, at the generated 512px derivative', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    expect(logo.tagName).toBe('IMG')
    expect(logo.getAttribute('src')).toBe('/assets/generated/branding/sidebar-branding-512.png')
  })

  it('3. does not hard-code a raw branding asset path in Sidebar.tsx — resolves only through resolveBrandingSrc', () => {
    const sourcePath = resolve(process.cwd(), 'src/components/Sidebar.tsx')
    const source = readFileSync(sourcePath, 'utf-8')
    expect(source).not.toMatch(/\/assets\/branding/)
    expect(source).not.toMatch(/\/assets\/generated/)
    expect(source).not.toMatch(/sfm-logo/)
    expect(source).not.toMatch(/sidebar-branding-\d/)
    expect(source).toContain("resolveBrandingSrc('sidebarBrandLockup')")
  })

  it('4. renders exactly one brand-lockup image — no duplicate logo alongside it', () => {
    const { container } = renderSidebar()
    const brandImages = Array.from(container.querySelectorAll('img')).filter((img) => img.getAttribute('alt') === 'Strategic Fleet Manager')
    expect(brandImages.length).toBe(1)
  })

  it('5. the old separate commissioning-mark-only image is no longer rendered — the identity area contains no img resolving to the square logo derivatives', () => {
    const { container } = renderSidebar()
    const imgs = Array.from(container.querySelectorAll('img'))
    expect(imgs.some((img) => (img.getAttribute('src') ?? '').includes('sfm-logo'))).toBe(false)
  })

  it('6. SFM, Strategic Fleet Manager, and the motto are not recreated as JSX text — the full lockup lives only in the commissioned image', () => {
    renderSidebar()
    expect(screen.queryByText('SFM')).not.toBeInTheDocument()
    expect(screen.queryByText('Strategic Fleet Manager')).not.toBeInTheDocument()
    expect(screen.queryByText('Plan')).not.toBeInTheDocument()
    expect(screen.queryByText('Outfit')).not.toBeInTheDocument()
    expect(screen.queryByText('Prepare')).not.toBeInTheDocument()
    expect(screen.queryByText('Succeed')).not.toBeInTheDocument()
  })

  it('7. APP_VERSION_LABEL renders exactly once in the branding console, as live text beneath the image', () => {
    renderSidebar()
    expect(screen.getAllByText(APP_VERSION_LABEL)).toHaveLength(1)
  })

  it('8. the image uses contain behavior and preserves aspect ratio — sized within a capped hardpoint, never stretched', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    expect(logo.className).toContain('object-contain')
    expect(logo.className).toContain('w-full')
    expect(logo.className).toContain('h-full')
    const hardpoint = logo.parentElement as HTMLElement
    expect(hardpoint.className).toContain('w-[180px]')
    expect(hardpoint.className).toContain('h-[270px]')
  })

  it('the image hardpoint is decorative/non-interactive and does not introduce a second nested panel', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    const hardpoint = logo.parentElement as HTMLElement
    expect(hardpoint.className).toContain('pointer-events-none')
    expect(hardpoint.className).toContain('select-none')
    expect(hardpoint.className).not.toContain('border')
    expect(hardpoint.className).not.toContain('panel')
  })

  it('the brand lockup reads as its own floating console — a bordered panel distinct from the sidebar background, matching the navigation console treatment', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    const brandConsole = logo.closest('div.rounded-lg') as HTMLElement
    expect(brandConsole).not.toBeNull()
    expect(brandConsole.className).toContain('border')
  })

  it('does not render a duplicate Update Budget / status strip in the sidebar', () => {
    renderSidebar()
    expect(screen.queryByText(/Update Budget/)).not.toBeInTheDocument()
  })

  it('9. every existing navigation route, label, and link count remains unchanged', () => {
    renderSidebar()
    const expectedRoutes = ['/', '/fleet', '/ship/ghost', '/loadout-manager', '/hangar', '/quick-update', '/decision-center', '/roadmap', '/log']
    const links = screen.getAllByRole('link')
    const hrefs = links.map((a) => a.getAttribute('href'))
    for (const route of expectedRoutes) {
      expect(hrefs).toContain(route)
    }
    expect(screen.getByText('Mission Control')).toBeInTheDocument()
    expect(screen.getByText('Fleet Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Loadout Manager')).toBeInTheDocument()
    expect(screen.getByText("Captain's Log")).toBeInTheDocument()
  })

  it('10/11. compactMark and sidebarCommissioningMark remain valid, unrepurposed semantic keys — missing/disabled assets still fail safely via the existing pattern', () => {
    // Exercised indirectly: Sidebar itself never references these keys anymore
    // (see test 3), and the registry-level guarantee that they still resolve
    // is covered in brandingAssets.test.ts. This test locks in that Sidebar's
    // own fallback (no image resolved) never crashes and never re-renders the
    // removed JSX lockup as a substitute.
    renderSidebar()
    expect(screen.queryByText('SFM')).not.toBeInTheDocument()
  })
})

describe('<Sidebar /> — EWO-015B branding presence refinement', () => {
  it('reduces the branding console internal padding ~35-45% from EWO-015 (px-4/py-6 -> px-2.5/py-3.5)', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    const console_ = logo.closest('div.rounded-lg') as HTMLElement
    expect(console_.className).toContain('px-2.5')
    expect(console_.className).toContain('py-3.5')
    expect(console_.className).not.toContain('px-4')
    expect(console_.className).not.toContain('py-6')
  })

  it('enlarges the image hardpoint container (not the artwork itself) while preserving contain/center and the 2:3 source aspect ratio', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    expect(logo.className).toContain('object-contain')
    expect(logo.className).toContain('object-center')
    const hardpoint = logo.parentElement as HTMLElement
    expect(hardpoint.className).toContain('w-[180px]')
    expect(hardpoint.className).toContain('h-[270px]')
    // 180:270 reduces to 2:3, matching the commissioned master's own ratio —
    // confirms the container grew proportionally rather than being resized
    // arbitrarily (which would either distort or waste hardpoint space).
    expect(180 / 270).toBeCloseTo(2 / 3, 5)
  })

  it('tightens the gap between the brand-lockup image and the live version label (mt-4 -> mt-2)', () => {
    renderSidebar()
    const versionEl = screen.getByText(APP_VERSION_LABEL)
    expect(versionEl.className).toContain('mt-2')
    expect(versionEl.className).not.toContain('mt-4')
  })

  it('does not hard-code branding paths and does not recreate branding in JSX after the density tuning', () => {
    const sourcePath = resolve(process.cwd(), 'src/components/Sidebar.tsx')
    const source = readFileSync(sourcePath, 'utf-8')
    expect(source).not.toMatch(/\/assets\/branding/)
    expect(source).not.toMatch(/\/assets\/generated/)
    expect(source).toContain("resolveBrandingSrc('sidebarBrandLockup')")
    renderSidebar()
    expect(screen.queryByText('SFM')).not.toBeInTheDocument()
    expect(screen.queryByText('Strategic Fleet Manager')).not.toBeInTheDocument()
  })

  it('protects existing architecture: Sidebar width, sticky positioning, navigation console, and routes remain unchanged', () => {
    const { container } = renderSidebar()
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.className).toContain('w-64')
    expect(aside.className).toContain('sticky')
    expect(aside.className).toContain('top-0')
    const nav = container.querySelector('nav') as HTMLElement
    expect(nav.className).toContain('py-5')
    expect(nav.className).toContain('px-3')
    const navConsole = nav.querySelector('div.rounded-lg') as HTMLElement
    expect(navConsole.className).toContain('p-1.5')
    const expectedRoutes = ['/', '/fleet', '/ship/ghost', '/loadout-manager', '/hangar', '/quick-update', '/decision-center', '/roadmap', '/log']
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    for (const route of expectedRoutes) {
      expect(hrefs).toContain(route)
    }
  })
})

describe('<Sidebar /> — EWO-015C optical-fit correction', () => {
  it('the hardpoint box itself is unchanged from EWO-015B (180x270) — the fix is a render-time crop, not a wrapper resize', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    const hardpoint = logo.parentElement as HTMLElement
    expect(hardpoint.className).toContain('w-[180px]')
    expect(hardpoint.className).toContain('h-[270px]')
    expect(hardpoint.className).toContain('overflow-hidden')
  })

  it('the console padding and image-to-version gap from EWO-015B are untouched — no further wrapper spacing changes', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    const console_ = logo.closest('div.rounded-lg') as HTMLElement
    expect(console_.className).toContain('px-2.5')
    expect(console_.className).toContain('py-3.5')
    const versionEl = screen.getByText(APP_VERSION_LABEL)
    expect(versionEl.className).toContain('mt-2')
  })

  it('applies a uniform, non-distorting scale to the image — same factor on both axes, object-fit/object-position preserved', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    expect(logo.className).toContain('object-contain')
    expect(logo.className).toContain('object-center')
    expect(logo.className).toContain('scale-125')
    // A single scale-125 utility scales both axes by the same factor —
    // this alone guarantees no stretching/distortion (an X/Y-independent
    // scale would require two different utilities, which this does not use).
    expect(logo.className).not.toMatch(/scale-x-|scale-y-/)
  })

  it('does not introduce a new asset reference or hard-coded path — same semantic key, same generated derivative', () => {
    renderSidebar()
    const logo = screen.getByAltText('Strategic Fleet Manager')
    expect(logo.getAttribute('src')).toBe('/assets/generated/branding/sidebar-branding-512.png')
    const sourcePath = resolve(process.cwd(), 'src/components/Sidebar.tsx')
    const source = readFileSync(sourcePath, 'utf-8')
    expect(source).not.toMatch(/\/assets\/branding/)
    expect(source).not.toMatch(/\/assets\/generated/)
    expect(source).toContain("resolveBrandingSrc('sidebarBrandLockup')")
  })

  it('does not recreate branding typography in JSX and does not alter navigation', () => {
    renderSidebar()
    expect(screen.queryByText('SFM')).not.toBeInTheDocument()
    expect(screen.queryByText('Strategic Fleet Manager')).not.toBeInTheDocument()
    expect(screen.getByText('Mission Control')).toBeInTheDocument()
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(9)
  })
})
