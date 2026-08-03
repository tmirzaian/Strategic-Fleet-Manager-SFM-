import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import FlightCommander from '../FlightCommander'
import { useFleetStore } from '../../store/useFleetStore'
import * as intelligenceModule from '../../utils/factoryLoadoutTargetIntelligence'
import type { FactoryLoadoutTargetIntelligenceResult } from '../../utils/factoryLoadoutTargetIntelligence'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <FlightCommander />
    </MemoryRouter>
  )
}

function mockResult(overrides: Partial<FactoryLoadoutTargetIntelligenceResult> = {}): FactoryLoadoutTargetIntelligenceResult {
  return {
    sourceShips: [],
    demandComponents: [],
    matchedDemandComponentCount: 0,
    totalFleetRequirementUnits: 0,
    sourceShipsIdentifiedCount: 0,
    highValueTargetCount: 0,
    factoryDataAvailable: true,
    ...overrides,
  }
}

function withMock(result: FactoryLoadoutTargetIntelligenceResult) {
  return vi.spyOn(intelligenceModule, 'resolveFactoryLoadoutTargetIntelligence').mockReturnValue(result)
}

const richResult = mockResult({
  sourceShips: [
    {
      shipDefinitionId: 'cutlass-black',
      displayName: 'Cutlass Black',
      distinctComponentCount: 2,
      totalUnresolvedUnitsCovered: 3,
      categoriesPresent: ['Shield', 'Cooler'],
      matches: [
        {
          componentName: 'Mirage',
          componentEntityClass: 'MIRAGE_EC',
          category: 'Shield',
          factoryQuantity: 2,
          fleetQuantityNeeded: 2,
          affected: [
            { shipId: 'corsair-1', shipName: 'Corsair', buildId: 'build-1', buildName: 'Cargo Build', quantity: 2, deepLink: { path: '/ship-workspace/corsair-1', shipId: 'corsair-1' } },
          ],
        },
        {
          componentName: 'CoolerX',
          componentEntityClass: 'COOLERX_EC',
          category: 'Cooler',
          factoryQuantity: 1,
          fleetQuantityNeeded: 1,
          affected: [{ shipId: 'ghost-1', shipName: 'Hornet Ghost', buildId: 'build-2', buildName: 'Stealth Build', quantity: 1, deepLink: { path: '/ship-workspace/ghost-1', shipId: 'ghost-1' } }],
        },
      ],
    },
    {
      shipDefinitionId: 'gladius',
      displayName: 'Gladius',
      distinctComponentCount: 1,
      totalUnresolvedUnitsCovered: 1,
      categoriesPresent: ['Shield'],
      matches: [
        {
          componentName: 'Mirage',
          componentEntityClass: 'MIRAGE_EC',
          category: 'Shield',
          factoryQuantity: 1,
          fleetQuantityNeeded: 2,
          affected: [{ shipId: 'corsair-1', shipName: 'Corsair', buildId: 'build-1', buildName: 'Cargo Build', quantity: 2, deepLink: { path: '/ship-workspace/corsair-1', shipId: 'corsair-1' } }],
        },
      ],
    },
  ],
  demandComponents: [
    { componentName: 'Mirage', componentEntityClass: 'MIRAGE_EC', category: 'Shield', fleetQuantityNeeded: 2, affected: [] },
    { componentName: 'CoolerX', componentEntityClass: 'COOLERX_EC', category: 'Cooler', fleetQuantityNeeded: 1, affected: [] },
  ],
  matchedDemandComponentCount: 2,
  totalFleetRequirementUnits: 3,
  sourceShipsIdentifiedCount: 2,
  highValueTargetCount: 1,
})

/**
 * EWO-108 — Flight Commander: Quartermaster Prototype Zero. Presentation
 * and interaction architecture only (Part B/C) — `resolveFactoryLoadoutTargetIntelligence`
 * is mocked exactly as it was for the certified EWO-104 suite so these
 * tests verify rendering, not resolver correctness (exhaustively covered,
 * untouched, in factoryLoadoutTargetIntelligence.test.ts /
 * flightCommanderPresentation.test.ts / flightCommanderComponentIdentity.test.ts
 * — Part R.1/3/4/5/6/11/12/21/22).
 */
describe('<FlightCommander /> — intelligence-active state (EWO-108 Part R.1-15,18)', () => {
  it('renders the canonical Station briefing header', () => {
    withMock(richResult)
    renderPage()
    expect(screen.getByText('Flight Commander')).toBeInTheDocument()
    expect(screen.getByText('Target Intelligence Available')).toBeInTheDocument()
  })

  it('R.1/R.2 — the page calls the resolver exactly once and never recomputes intelligence itself', () => {
    const spy = withMock(richResult)
    renderPage()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('R.18 — summary metrics reflect the resolver output exactly, truthfully, in the active state', () => {
    withMock(richResult)
    renderPage()
    expect(within(screen.getByTestId('summary-card-source-ships-identified')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByTestId('summary-card-priority-components')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByTestId('summary-card-fleet-requirements')).getByText('3')).toBeInTheDocument()
    expect(within(screen.getByTestId('summary-card-high-value-targets')).getByText('1')).toBeInTheDocument()
  })

  it('summary instrument values use Quartermaster Gold, never success/warning/danger', () => {
    withMock(richResult)
    renderPage()
    const value = within(screen.getByTestId('summary-card-source-ships-identified')).getByText('2')
    expect(value.className).toContain('text-gold')
    expect(value.className).not.toContain('text-success')
    expect(value.className).not.toContain('text-warning')
    expect(value.className).not.toContain('text-danger')
  })

  it('R.3 — the roster is grouped by source ship, ranked exactly as returned by the resolver', () => {
    withMock(richResult)
    renderPage()
    const rows = screen.getAllByTestId(/^dossier-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['dossier-cutlass-black', 'dossier-gladius'])
  })

  it('component matches and their "Needed:" destinations render with quantities, per Part J', () => {
    withMock(richResult)
    renderPage()
    const cutlassRow = screen.getByTestId('dossier-cutlass-black')
    expect(within(cutlassRow).getByText('Mirage')).toBeInTheDocument()
    expect(within(cutlassRow).getAllByText('Needed:').length).toBeGreaterThan(0)
    expect(within(cutlassRow).getByText(/Cargo Build ×2/)).toBeInTheDocument()
  })

  it('R.14 — a fleet requirement deep-links to the correct existing Ship Management route', () => {
    withMock(richResult)
    renderPage()
    const cutlassRow = screen.getByTestId('dossier-cutlass-black')
    const link = within(cutlassRow).getByRole('link', { name: 'Corsair' })
    expect(link).toHaveAttribute('href', '/ship-workspace/corsair-1')
  })

  it('R.5 — category filter narrows the roster to source ships with a match in that category, unchanged from EWO-104', () => {
    withMock(richResult)
    renderPage()
    expect(screen.getAllByTestId(/^dossier-/)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Coolers' }))
    const rows = screen.getAllByTestId(/^dossier-/)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('data-testid', 'dossier-cutlass-black')
  })

  it('R.4 — search filters by source ship name and by component name, unchanged from EWO-104', () => {
    withMock(richResult)
    renderPage()
    fireEvent.change(screen.getByLabelText('Search target roster'), { target: { value: 'Gladius' } })
    expect(screen.getAllByTestId(/^dossier-/).map((r) => r.getAttribute('data-testid'))).toEqual(['dossier-gladius'])

    fireEvent.change(screen.getByLabelText('Search target roster'), { target: { value: 'CoolerX' } })
    expect(screen.getAllByTestId(/^dossier-/).map((r) => r.getAttribute('data-testid'))).toEqual(['dossier-cutlass-black'])
  })

  it('a search with no matches shows the no-filtered-results state without crashing', () => {
    withMock(richResult)
    renderPage()
    fireEvent.change(screen.getByLabelText('Search target roster'), { target: { value: 'nonexistent-xyz' } })
    expect(screen.getByTestId('no-filtered-results')).toBeInTheDocument()
  })

  it('R.15 — no mutation controls or store writes exist anywhere on the page', () => {
    withMock(richResult)
    renderPage()
    const mutationLabelPattern = /install|remove|save|discard|reserve|delete|retire|purge|borrow/i
    const buttons = screen.queryAllByRole('button').filter((b) => mutationLabelPattern.test(b.textContent ?? ''))
    expect(buttons).toEqual([])
    const allButtons = screen.getAllByRole('button')
    expect(allButtons.every((b) => /^(All|Coolers|Power Plants|Quantum Drives|Shields|Weapons)$/.test(b.textContent ?? ''))).toBe(true)
    const links = screen.getAllByRole('link')
    expect(links.every((l) => l.tagName === 'A')).toBe(true)
  })
})

describe('<FlightCommander /> — Part C: continuous CIC environmental composition', () => {
  it('mounts the approved flight-commander environment exactly once, never duplicated, in the active state', () => {
    withMock(richResult)
    const { container } = renderPage()
    expect(container.querySelectorAll('[data-environment-id="flight-commander"]')).toHaveLength(1)
  })

  it('the environment still mounts exactly once during Standing Watch — Part C.7 forbids a second/duplicated mount', () => {
    withMock(mockResult({ demandComponents: [] }))
    const { container } = renderPage()
    expect(container.querySelectorAll('[data-environment-id="flight-commander"]')).toHaveLength(1)
    expect(screen.getByTestId('standing-watch-panel')).toBeInTheDocument()
  })

  it('the environment mounts even when factory data is unavailable, establishing Station identity regardless of data state', () => {
    withMock(mockResult({ factoryDataAvailable: false, demandComponents: [{ componentName: 'Mirage', componentEntityClass: null, category: 'Shield', fleetQuantityNeeded: 1, affected: [] }] }))
    const { container } = renderPage()
    expect(container.querySelector('[data-environment-id="flight-commander"]')).not.toBeNull()
  })

  it('summary instruments are not shown when factory data is unavailable — a "0" would be misleading, not a real confirmed zero', () => {
    withMock(mockResult({ factoryDataAvailable: false, demandComponents: [{ componentName: 'Mirage', componentEntityClass: null, category: 'Shield', fleetQuantityNeeded: 1, affected: [] }] }))
    renderPage()
    expect(screen.queryByTestId('summary-cards')).not.toBeInTheDocument()
  })
})

describe('<FlightCommander /> — Part K: long-roster scroll context', () => {
  it('the Intelligence Control Rail is sticky, so category/search context persists during a long scroll', () => {
    withMock(richResult)
    renderPage()
    const rail = screen.getByTestId('intelligence-control-rail')
    const stickyWrapper = rail.parentElement as HTMLElement
    expect(stickyWrapper.className).toContain('sticky')
    expect(stickyWrapper.className).toContain('top-0')
  })

  it('every category glyph carries a persistent, accessible label regardless of scroll position (no detached/unlabeled dots)', () => {
    withMock(richResult)
    renderPage()
    const gladiusRow = screen.getByTestId('dossier-gladius')
    expect(within(gladiusRow).getByLabelText('Shields match')).toBeInTheDocument()
    expect(within(gladiusRow).getByLabelText('Coolers not matched')).toBeInTheDocument()
  })
})

describe('<FlightCommander /> — Part L: Standing Watch (R.16, R.17)', () => {
  it('R.16 — Standing Watch renders, with the exact required copy, when zero unresolved target components exist', () => {
    withMock(mockResult({ demandComponents: [] }))
    expect(() => renderPage()).not.toThrow()
    const panel = screen.getByTestId('standing-watch-panel')
    expect(within(panel).getByText('Flight Intelligence')).toBeInTheDocument()
    expect(within(panel).getByText('Standing Watch')).toBeInTheDocument()
    expect(within(panel).getByText('Fleet Intelligence has no active acquisition targets.')).toBeInTheDocument()
    expect(within(panel).getByText(/Current Commander doctrine is fully supported/)).toBeInTheDocument()
    expect(within(panel).getByText('Continue normal operations.')).toBeInTheDocument()
    expect(within(panel).getByText(/Flight Commander will identify new target opportunities/)).toBeInTheDocument()
    expect(within(panel).getByText('Intelligence Status')).toBeInTheDocument()
    expect(within(panel).getByText('Monitoring known factory configurations')).toBeInTheDocument()
    expect(within(panel).getByText('Monitoring Commander procurement requirements')).toBeInTheDocument()
    expect(within(panel).getByText('Awaiting actionable target opportunities')).toBeInTheDocument()
  })

  it('R.16 — Standing Watch also renders when demand exists but no factory source ship matches it', () => {
    withMock(mockResult({ demandComponents: [{ componentName: 'Mirage', componentEntityClass: null, category: 'Shield', fleetQuantityNeeded: 1, affected: [] }], sourceShips: [] }))
    renderPage()
    expect(screen.getByTestId('standing-watch-panel')).toBeInTheDocument()
  })

  it('never shows an empty table or a "No Results" message during Standing Watch', () => {
    withMock(mockResult({ demandComponents: [] }))
    renderPage()
    expect(screen.queryByTestId('target-roster')).not.toBeInTheDocument()
    expect(screen.queryByTestId('no-filtered-results')).not.toBeInTheDocument()
    expect(screen.queryByText(/no results/i)).not.toBeInTheDocument()
  })

  it('Standing Watch never uses warning/error/failure tones', () => {
    withMock(mockResult({ demandComponents: [] }))
    renderPage()
    const panel = screen.getByTestId('standing-watch-panel')
    expect(panel.className).not.toContain('text-danger')
    expect(panel.className).not.toContain('border-danger')
    expect(panel.className).not.toContain('warning')
  })

  it('R.16 — the header condition line reads "Standing Watch" and carries no active-state summary line', () => {
    withMock(mockResult({ demandComponents: [] }))
    renderPage()
    expect(screen.getAllByText('Standing Watch').length).toBeGreaterThan(0)
    expect(screen.queryByText(/tracked across/)).not.toBeInTheDocument()
  })

  it('R.18 — summary instruments remain truthful (real values, not hidden) during Standing Watch when factory data is available', () => {
    withMock(mockResult({ demandComponents: [], sourceShipsIdentifiedCount: 0, matchedDemandComponentCount: 0, totalFleetRequirementUnits: 0, highValueTargetCount: 0 }))
    renderPage()
    expect(within(screen.getByTestId('summary-card-source-ships-identified')).getByText('0')).toBeInTheDocument()
  })

  it('R.17 — Standing Watch does not appear once intelligence exists, and the roster/control rail take its place (a live automatic transition is verified in the Part S browser walkthrough)', () => {
    withMock(mockResult({ demandComponents: [] }))
    renderPage()
    expect(screen.getByTestId('standing-watch-panel')).toBeInTheDocument()
    cleanup()
    vi.restoreAllMocks()

    withMock(richResult)
    renderPage()
    expect(screen.queryByTestId('standing-watch-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('target-roster')).toBeInTheDocument()
  })

  it('a cosmetic/promotional source ship (e.g. a Wikelo variant) still resolves to Standing Watch, not a broken roster', () => {
    withMock(
      mockResult({
        sourceShips: [
          {
            shipDefinitionId: 'wikelo-ship',
            displayName: 'F7 Hornet Mk Wikelo',
            distinctComponentCount: 1,
            totalUnresolvedUnitsCovered: 1,
            categoriesPresent: ['Shield'],
            matches: [
              {
                componentName: 'Mirage',
                componentEntityClass: 'MIRAGE_EC',
                category: 'Shield',
                factoryQuantity: 1,
                fleetQuantityNeeded: 1,
                affected: [{ shipId: 'c1', shipName: 'Corsair', buildId: 'b1', buildName: 'Build', quantity: 1, deepLink: { path: '/ship-workspace/c1', shipId: 'c1' } }],
              },
            ],
          },
        ],
        demandComponents: [{ componentName: 'Mirage', componentEntityClass: 'MIRAGE_EC', category: 'Shield', fleetQuantityNeeded: 1, affected: [] }],
      })
    )
    renderPage()
    expect(screen.queryByText('F7 Hornet Mk Wikelo')).not.toBeInTheDocument()
    expect(screen.getByTestId('standing-watch-panel')).toBeInTheDocument()
  })
})

describe('<FlightCommander /> — Part Q/R.21: no persistence or authority changes', () => {
  it('the live store persist configuration is unchanged by this EWO', () => {
    const options = useFleetStore.persist.getOptions()
    expect(options.version).toBe(11)
  })
})

/**
 * R.19 — reduced-motion treatment. Standing Watch reuses the radar-sweep
 * animation as an "active monitoring" indicator (Part L.8); this asserts
 * the CSS rule this session added specifically to satisfy Part L.7 (a
 * real, pre-existing gap — no reduced-motion rule existed anywhere in
 * index.css before this EWO).
 */
describe('EWO-108 (Part L.7 / R.19) — reduced-motion respected in source CSS', () => {
  it('disables the radar-sweep animation under prefers-reduced-motion: reduce', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf-8')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[^}]*\{[^}]*\.animate-radar-sweep/)
  })
})

/**
 * R.20 — responsive rendering. jsdom has no real viewport, so this
 * confirms the responsive utility classes the CIC shell/instrument
 * column depend on are actually present in the rendered output (the live
 * narrow-viewport check itself is part of Part S's browser walkthrough).
 */
describe('EWO-108 (Part O / R.20) — responsive classes present', () => {
  it('the CIC shell and instrument column carry responsive (lg:) breakpoints rather than fixed-only widths', () => {
    withMock(richResult)
    const { container } = renderPage()
    const shell = container.querySelector('[data-environment-id="flight-commander"]')?.parentElement as HTMLElement
    expect(shell.className).toContain('lg:min-h-[560px]')
    expect(shell.className).toContain('flex-col')
    expect(shell.className).toContain('lg:flex-row')
  })
})

/**
 * EWO-109 (Part D/J) — proves the page actually *consumes* the shell
 * (renders the shell's own components, identifiable by the shell's own
 * test ids) rather than merely reproducing visually-equivalent markup in
 * parallel. All three states are checked since the shell's regions
 * appear in different combinations depending on presentation state.
 */
describe('EWO-109 — Flight Commander consumes the Quartermaster Station Shell', () => {
  it('the environment mount and briefing region are the shell\'s own components, present in every data state', () => {
    withMock(mockResult({ factoryDataAvailable: false, demandComponents: [{ componentName: 'Mirage', componentEntityClass: null, category: 'Shield', fleetQuantityNeeded: 1, affected: [] }] }))
    renderPage()
    expect(screen.getByTestId('station-environment-mount')).toBeInTheDocument()
  })

  it('the operational rail mount and primary workspace are the shell\'s own components in the intelligence-active state', () => {
    withMock(richResult)
    renderPage()
    expect(screen.getByTestId('operational-rail-mount')).toBeInTheDocument()
    expect(screen.getByTestId('primary-workspace')).toBeInTheDocument()
    // The rail mount and workspace nest the page's own, unchanged content.
    expect(screen.getByTestId('operational-rail-mount')).toContainElement(screen.getByLabelText('Search target roster'))
    expect(screen.getByTestId('primary-workspace')).toContainElement(screen.getByTestId('target-roster'))
  })

  it('the operational rail mount and primary workspace do not render during Standing Watch — the shell reflects the page\'s own state, it does not invent its own', () => {
    withMock(mockResult({ demandComponents: [] }))
    renderPage()
    expect(screen.queryByTestId('operational-rail-mount')).not.toBeInTheDocument()
    expect(screen.queryByTestId('primary-workspace')).not.toBeInTheDocument()
    expect(screen.getByTestId('standing-watch-panel')).toBeInTheDocument()
  })

  it('Standing Watch renders through the shell\'s own StandingReportRegion test id contract', () => {
    withMock(mockResult({ demandComponents: [] }))
    const { container } = renderPage()
    // StandingWatchPanel passes its own testId override ('standing-watch-panel')
    // into the shell's StandingReportRegion — confirm the shell's own
    // monitoring-visual class is present underneath it, proving the shell
    // component rendered, not a parallel reimplementation.
    expect(container.querySelector('[data-testid="standing-watch-panel"] .animate-radar-sweep')).not.toBeNull()
  })
})
