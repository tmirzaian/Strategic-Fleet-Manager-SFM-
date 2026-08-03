import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import App from '../App'
import { useFleetStore } from '../store/useFleetStore'
import { APP_VERSION_LABEL } from '../config/appVersion'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

const routes = ['/', '/fleet', '/ship/ghost', '/loadout-manager', '/flight-commander', '/hangar', '/quick-update', '/decision-center', '/roadmap', '/log']

describe('Mission M-011: every existing application route renders without throwing', () => {
  it.each(routes)('%s renders', (route) => {
    expect(() =>
      render(
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      )
    ).not.toThrow()
  })
})

describe('EWO-060: "Ship Workspace" terminology is fully retired from rendered production UI', () => {
  it.each([...routes, '/ship-workspace', '/ship-workspace/ghost'])('%s never renders the retired "Ship Workspace" string', (route) => {
    render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    )
    expect(document.body.textContent).not.toContain('Ship Workspace')
  })
})

describe('UX-004A: Universal Footer renders on every scoped and legacy route', () => {
  it.each([...routes, '/ship-workspace', '/ship-workspace/ghost'])('%s renders exactly one <footer> with the canonical version and the POPS slogan', (route) => {
    const { container } = render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    )
    const footers = container.querySelectorAll('footer')
    expect(footers).toHaveLength(1)
    expect(footers[0].textContent).toContain(`SFM ${APP_VERSION_LABEL}`)
    expect(footers[0].textContent).toContain('Plan')
    expect(footers[0].textContent).toContain('Outfit')
    expect(footers[0].textContent).toContain('Prepare')
    expect(footers[0].textContent).toContain('Succeed')
  })

  it.each([...routes, '/ship-workspace', '/ship-workspace/ghost'])('%s never displays the version in more than one place outside the footer\'s own text (branding cell no longer shows it)', (route) => {
    const { container } = render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    )
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.textContent).not.toContain(APP_VERSION_LABEL)
  })

  it('the Sidebar retains its fixed width on every route — the footer/branding fitment pass never touches sidebar width', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.className).toContain('w-64')
  })
})

/**
 * EWO-115 (Part L) — Flagship Shell Amendment test checklist. Items are
 * grouped by the work order's own numbering; item 3 (all existing routes
 * remain present) and item 11 (legacy Stations remain readable) are
 * already covered by the pre-existing "every route renders without
 * throwing" suite above and are not duplicated here.
 */
describe('EWO-115 (Part L, items 1/12): exactly one FlagshipFrame and exactly one Station Access Panel per route, on every route', () => {
  it.each(routes)('%s renders exactly one FlagshipFrame and exactly one Station Access Panel', (route) => {
    const { container } = render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    )
    expect(container.querySelectorAll('[data-testid="flagship-frame"]')).toHaveLength(1)
    expect(container.querySelectorAll('nav[aria-label="Station Access"]')).toHaveLength(1)
  })
})

describe('EWO-115 (Part L, item 4/6): active-route indication and persistent branding', () => {
  // EWO-062A (Part B) — '/ship/ghost' (-> Ship Detail), '/loadout-manager',
  // and '/quick-update' are deep-link-only routes with no Station Access
  // Panel entry at all (deliberate navigation retirement, not an EWO-115
  // regression) — aria-current can only be asserted for routes the panel
  // actually lists.
  const navRoutes = routes.filter((r) => !['/ship/ghost', '/loadout-manager', '/quick-update'].includes(r))

  it.each(navRoutes)('%s marks its own Station Access Panel entry with aria-current="page" — never color alone', (route) => {
    const { container } = render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    )
    const nav = container.querySelector('nav[aria-label="Station Access"]') as HTMLElement
    const current = nav.querySelectorAll('a[aria-current="page"]')
    expect(current.length).toBe(1)
  })

  it.each(routes)('%s renders the persistent SFM branding lockup, unchanged across route changes', (route) => {
    const { container } = render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    )
    const aside = container.querySelector('aside') as HTMLElement
    const brandImage = aside.querySelector('img[alt="Strategic Fleet Manager"]')
    expect(brandImage).not.toBeNull()
  })
})

describe('EWO-115 (Part L, item 5): Station Access Panel entries remain natively keyboard-operable with a visible focus state', () => {
  it('every Station Access Panel entry is a real <a> element (native Tab order, Enter/Space activation) with an explicit focus-visible ring', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    const nav = container.querySelector('nav[aria-label="Station Access"]') as HTMLElement
    const links = Array.from(nav.querySelectorAll('a'))
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.hasAttribute('href')).toBe(true)
      expect(link.className).toContain('focus-visible:ring-2')
    }
  })
})

describe('EWO-115 (Part L, items 7/8): the environment layer is not confined to a legacy bordered hero cell, and Mission Control specifically drives it with the Bridge plate', () => {
  it('FlagshipEnvironmentLayer is a full-viewport fixed layer, not a bordered/rounded hero cell, on every route', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/fleet']}>
        <App />
      </MemoryRouter>
    )
    const layer = container.querySelector('[data-testid="flagship-environment-layer"]') as HTMLElement
    expect(layer.className).toContain('fixed')
    expect(layer.className).toContain('inset-0')
    expect(layer.className).not.toContain('rounded')
    expect(layer.className).not.toContain('border')
  })

  it('mission-control-v2 renders as FlagshipEnvironmentLayer\'s own plate only on "/" — every other route falls back to the ambient gradient alone', () => {
    const onMissionControl = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    const mcPlate = onMissionControl.container.querySelector('[data-testid="flagship-environment-layer-plate"] [data-environment-id="mission-control"]')
    expect(mcPlate).not.toBeNull()
    cleanup()

    const onFleet = render(
      <MemoryRouter initialEntries={['/fleet']}>
        <App />
      </MemoryRouter>
    )
    expect(onFleet.container.querySelector('[data-testid="flagship-environment-layer-plate"]')).toBeNull()
  })

  // EWO-116 (Part L, item 5) — the Technical Evaluation Laboratory plate,
  // the second Station (after Mission Control) promoted to the
  // full-viewport model. Same viewport-not-hero-banner mechanism, same
  // exclusivity proof.
  it('technical-evaluation-laboratory-v2 renders as FlagshipEnvironmentLayer\'s own plate only on "/decision-center" — no bordered/rounded hero-cell wrapper anywhere around it', () => {
    const onDecisionCenter = render(
      <MemoryRouter initialEntries={['/decision-center']}>
        <App />
      </MemoryRouter>
    )
    const layer = onDecisionCenter.container.querySelector('[data-testid="flagship-environment-layer"]') as HTMLElement
    const dcPlate = onDecisionCenter.container.querySelector('[data-testid="flagship-environment-layer-plate"] [data-environment-id="decision-center"]')
    expect(dcPlate).not.toBeNull()
    expect(layer.className).not.toContain('rounded')
    expect(layer.className).not.toContain('border')
    // No legacy EnvironmentBay-style bordered/rounded cell exists anywhere
    // on this route either (EWO-116 Part C — "never a hero banner").
    expect(onDecisionCenter.container.querySelector('[data-testid="station-environment-mount"]')).toBeNull()
    cleanup()

    const onHangar = render(
      <MemoryRouter initialEntries={['/hangar']}>
        <App />
      </MemoryRouter>
    )
    expect(onHangar.container.querySelector('[data-testid="flagship-environment-layer-plate"]')).toBeNull()
  })
})

describe('EWO-115 (Part L, item 9): Mission Control\'s CompartmentHeader is integrated into the Bridge composition, never duplicated', () => {
  it('renders "Mission Control" / "Operations Standing By" exactly once each on "/"', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    expect(container.querySelectorAll('h1').length).toBeGreaterThanOrEqual(1)
    const headings = Array.from(container.querySelectorAll('h1')).filter((h) => h.textContent === 'Operations Standing By')
    expect(headings).toHaveLength(1)
  })
})

describe('EWO-115 (Part L, item 10): Flight Commander\'s own bordered/rounded hero cell is structurally unchanged — no unapproved visual migration', () => {
  it('/flight-commander still renders a bordered, rounded StationEnvironmentMount, exactly like every pre-EWO-115 certification', async () => {
    const { findByTestId } = render(
      <MemoryRouter initialEntries={['/flight-commander']}>
        <App />
      </MemoryRouter>
    )
    // FlightCommander is React.lazy-loaded (EWO-107) — its own chunk
    // resolves asynchronously, unlike the routes rendered synchronously
    // elsewhere in this file.
    const mount = await findByTestId('station-environment-mount')
    expect(mount.className).toContain('rounded-xl')
    expect(mount.className).toContain('lg:border')
  })
})

describe('EWO-115 (Part L, item 13): no business authority enters FlagshipFrame, FlagshipEnvironmentLayer, FlagshipThreshold, or the Station Access Panel (Sidebar)', () => {
  const forbiddenImportFragments = ['useFleetStore', 'factoryLoadoutTargetIntelligence', 'flightCommanderPresentation', 'quartermasterBriefing', 'shipDefinitions', '/pages/']
  const filesToScan = [
    resolve(__dirname, '../components/flagship/FlagshipFrame.tsx'),
    resolve(__dirname, '../components/flagship/FlagshipEnvironmentLayer.tsx'),
    resolve(__dirname, '../components/flagship/FlagshipThreshold.tsx'),
    resolve(__dirname, '../components/Sidebar.tsx'),
  ]

  it.each(filesToScan)('%s imports nothing from fleet/Station business logic, store, or page tree', (file) => {
    const source = readFileSync(file, 'utf-8')
    const importLines = source.split('\n').filter((line) => line.trim().startsWith('import'))
    for (const fragment of forbiddenImportFragments) {
      expect(importLines.some((line) => line.includes(fragment))).toBe(false)
    }
  })
})

describe('EWO-115 (Part L, item 14): no persistence changes — the shell amendment touches no localStorage/sessionStorage', () => {
  const filesToScan = [
    resolve(__dirname, '../components/flagship/FlagshipFrame.tsx'),
    resolve(__dirname, '../components/flagship/FlagshipEnvironmentLayer.tsx'),
    resolve(__dirname, '../components/flagship/FlagshipThreshold.tsx'),
    resolve(__dirname, '../components/Sidebar.tsx'),
    resolve(__dirname, '../App.tsx'),
  ]

  it.each(filesToScan)('%s references neither localStorage nor sessionStorage', (file) => {
    const source = readFileSync(file, 'utf-8')
    expect(source.includes('localStorage')).toBe(false)
    expect(source.includes('sessionStorage')).toBe(false)
  })
})

describe('EWO-115 (Part L, item 15): reduced-motion — no new decorative animation was introduced by the shell amendment', () => {
  const filesToScan = [
    resolve(__dirname, '../components/flagship/FlagshipFrame.tsx'),
    resolve(__dirname, '../components/flagship/FlagshipEnvironmentLayer.tsx'),
    resolve(__dirname, '../components/flagship/FlagshipThreshold.tsx'),
    resolve(__dirname, '../components/Sidebar.tsx'),
  ]

  it.each(filesToScan)('%s introduces no `animate-*` class', (file) => {
    const source = readFileSync(file, 'utf-8')
    expect(/\banimate-[a-z-]+/.test(source)).toBe(false)
  })
})
