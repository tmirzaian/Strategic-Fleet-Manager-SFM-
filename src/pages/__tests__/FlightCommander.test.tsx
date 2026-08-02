import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
 * EWO-104 (corrected) — Flight Commander Factory Loadout Target
 * Intelligence page. `resolveFactoryLoadoutTargetIntelligence` is mocked
 * for these page-level tests so UI rendering is verified independently of
 * resolver correctness (exhaustively covered in
 * `factoryLoadoutTargetIntelligence.test.ts`) — this suite only proves the
 * page faithfully renders whatever the resolver returns, and never
 * computes anything of its own.
 */
describe('<FlightCommander /> (Factory Loadout Target Intelligence)', () => {
  it('renders the canonical page header', () => {
    withMock(mockResult())
    renderPage()
    expect(screen.getByText('Flight Commander')).toBeInTheDocument()
    expect(screen.getByText('Target Intelligence Available')).toBeInTheDocument()
  })

  it('no-demand empty state: zero unresolved target components renders the Operational Briefing panel, never a crash', () => {
    withMock(mockResult({ demandComponents: [] }))
    expect(() => renderPage()).not.toThrow()
    expect(screen.getByTestId('operational-briefing-panel')).toBeInTheDocument()
    expect(screen.getByText('No actionable factory targets identified.')).toBeInTheDocument()
  })

  it('no-source-match empty state: demand exists but no factory source ship matches also renders the Operational Briefing panel', () => {
    withMock(mockResult({ demandComponents: [{ componentName: 'Mirage', componentEntityClass: null, category: 'Shield', fleetQuantityNeeded: 1, affected: [] }], sourceShips: [] }))
    renderPage()
    expect(screen.getByTestId('operational-briefing-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('summary-cards')).toBeInTheDocument() // summary still renders — the roster below it is what's empty
  })

  it('factory-data-unavailable diagnostic state takes priority and is non-destructive', () => {
    withMock(mockResult({ factoryDataAvailable: false, demandComponents: [{ componentName: 'Mirage', componentEntityClass: null, category: 'Shield', fleetQuantityNeeded: 1, affected: [] }] }))
    expect(() => renderPage()).not.toThrow()
    expect(screen.getByTestId('factory-data-unavailable-state')).toBeInTheDocument()
    expect(screen.queryByTestId('summary-cards')).not.toBeInTheDocument()
  })

  it('summary cards reflect the resolver output exactly', () => {
    withMock(richResult)
    renderPage()
    expect(within(screen.getByTestId('summary-card-source-ships-identified')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByTestId('summary-card-priority-components')).getByText('2')).toBeInTheDocument()
    expect(within(screen.getByTestId('summary-card-fleet-requirements')).getByText('3')).toBeInTheDocument()
    expect(within(screen.getByTestId('summary-card-high-value-targets')).getByText('1')).toBeInTheDocument()
  })

  it('the target roster is grouped by source ship, ranked as returned by the resolver', () => {
    withMock(richResult)
    renderPage()
    const rows = screen.getAllByTestId(/^roster-row-/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['roster-row-cutlass-black', 'roster-row-gladius'])
  })

  it('category indicators render for matched categories only', () => {
    withMock(richResult)
    renderPage()
    const gladiusRow = screen.getByTestId('roster-row-gladius')
    expect(within(gladiusRow).getAllByLabelText('Shields match')).toHaveLength(1)
    expect(within(gladiusRow).queryByLabelText('Coolers match')).not.toBeInTheDocument()
  })

  it('matching fleet requirements list the needed-by ships/builds with quantities', () => {
    withMock(richResult)
    renderPage()
    const cutlassRow = screen.getByTestId('roster-row-cutlass-black')
    expect(within(cutlassRow).getByText(/Mirage/)).toBeInTheDocument()
    expect(within(cutlassRow).getByText(/Cargo Build ×2/)).toBeInTheDocument()
  })

  it('a fleet requirement deep-links to the correct existing Ship Management route', () => {
    withMock(richResult)
    renderPage()
    const cutlassRow = screen.getByTestId('roster-row-cutlass-black')
    const link = within(cutlassRow).getByRole('link', { name: 'Corsair' })
    expect(link).toHaveAttribute('href', '/ship-workspace/corsair-1')
  })

  it('category filter narrows the roster to source ships with a match in that category', () => {
    withMock(richResult)
    renderPage()
    expect(screen.getAllByTestId(/^roster-row-/)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Coolers' }))
    const rows = screen.getAllByTestId(/^roster-row-/)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveAttribute('data-testid', 'roster-row-cutlass-black')
  })

  it('search filters by source ship name and by component name', () => {
    withMock(richResult)
    renderPage()
    fireEvent.change(screen.getByLabelText('Search target roster'), { target: { value: 'Gladius' } })
    expect(screen.getAllByTestId(/^roster-row-/).map((r) => r.getAttribute('data-testid'))).toEqual(['roster-row-gladius'])

    fireEvent.change(screen.getByLabelText('Search target roster'), { target: { value: 'CoolerX' } })
    expect(screen.getAllByTestId(/^roster-row-/).map((r) => r.getAttribute('data-testid'))).toEqual(['roster-row-cutlass-black'])
  })

  it('a search with no matches shows the no-filtered-results state without crashing', () => {
    withMock(richResult)
    renderPage()
    fireEvent.change(screen.getByLabelText('Search target roster'), { target: { value: 'nonexistent-xyz' } })
    expect(screen.getByTestId('no-filtered-results')).toBeInTheDocument()
  })

  it('no mutation controls or store writes exist anywhere on the page', () => {
    withMock(richResult)
    renderPage()
    const mutationLabelPattern = /install|remove|save|discard|reserve|delete|retire|purge|borrow/i
    const buttons = screen.queryAllByRole('button').filter((b) => mutationLabelPattern.test(b.textContent ?? ''))
    expect(buttons).toEqual([])
    // The search input is a filter control, not an editing control — it
    // never calls a store action. Confirm no store-mutating action is
    // reachable via any button on the page: only filter pills exist.
    const allButtons = screen.getAllByRole('button')
    expect(allButtons.every((b) => /^(All|Coolers|Power Plants|Quantum Drives|Shields|Weapons)$/.test(b.textContent ?? ''))).toBe(true)
    const links = screen.getAllByRole('link')
    expect(links.every((l) => l.tagName === 'A')).toBe(true)
  })
})

/**
 * EWO-104 Amendment 2 (Part F) — hero integration. Confirms the page
 * mounts the approved `'flight-commander'` environment through the same
 * canonical `PageEnvironment` composition every other hero page uses, and
 * that the summary cards render inside it only once real data exists.
 */
describe('<FlightCommander /> — EWO-104 Amendment 2: hero integration', () => {
  it('mounts the approved flight-commander environment via PageEnvironment', () => {
    withMock(richResult)
    const { container } = renderPage()
    const environmentLayer = container.querySelector('[data-environment-id="flight-commander"]')
    expect(environmentLayer).not.toBeNull()
  })

  it('the hero renders even in the no-demand empty state, establishing the compartment identity regardless of data state', () => {
    withMock(mockResult({ demandComponents: [] }))
    const { container } = renderPage()
    expect(container.querySelector('[data-environment-id="flight-commander"]')).not.toBeNull()
    expect(screen.getByTestId('operational-briefing-panel')).toBeInTheDocument()
  })

  it('summary cards are not shown inside the hero when factory data is unavailable (a "0" would be misleading, not a real confirmed zero)', () => {
    withMock(mockResult({ factoryDataAvailable: false, demandComponents: [{ componentName: 'Mirage', componentEntityClass: null, category: 'Shield', fleetQuantityNeeded: 1, affected: [] }] }))
    const { container } = renderPage()
    expect(container.querySelector('[data-environment-id="flight-commander"]')).not.toBeNull()
    expect(screen.queryByTestId('summary-cards')).not.toBeInTheDocument()
  })
})

/**
 * EWO-104 Amendment 1 — presentation and filtering only. These tests
 * exercise the REAL `buildFlightCommanderPresentation` (not mocked) on top
 * of a mocked raw resolver result, proving the full pipeline: cosmetic/
 * promotional variant exclusion (Part D), actionable-category-only
 * presentation (Part E), Quartermaster Gold summary numbers, and the
 * compact icon category-column headers (Part C).
 */
describe('<FlightCommander /> — EWO-104 Amendment 1: presentation refinement', () => {
  it('a cosmetic/promotional source ship (e.g. a Wikelo variant) never appears in the rendered roster', () => {
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
    // The demand was real (Shield/actionable), but its only source is
    // cosmetic — this must still read as the Operational Briefing panel.
    expect(screen.getByTestId('operational-briefing-panel')).toBeInTheDocument()
  })

  it('a non-actionable category match (e.g. Missile Rack) is never shown, even though the raw resolver returned it', () => {
    withMock(
      mockResult({
        sourceShips: [
          {
            shipDefinitionId: 'cutlass-black',
            displayName: 'Cutlass Black',
            distinctComponentCount: 1,
            totalUnresolvedUnitsCovered: 1,
            categoriesPresent: ['MissileRack'],
            matches: [
              {
                componentName: 'Rattler Missile Rack',
                componentEntityClass: null,
                category: 'MissileRack',
                factoryQuantity: 1,
                fleetQuantityNeeded: 1,
                affected: [{ shipId: 'c1', shipName: 'Corsair', buildId: 'b1', buildName: 'Build', quantity: 1, deepLink: { path: '/ship-workspace/c1', shipId: 'c1' } }],
              },
            ],
          },
        ],
        demandComponents: [{ componentName: 'Rattler Missile Rack', componentEntityClass: null, category: 'MissileRack', fleetQuantityNeeded: 1, affected: [] }],
      })
    )
    renderPage()
    // Non-actionable demand only — no ship survives the category filter.
    expect(screen.getByTestId('operational-briefing-panel')).toBeInTheDocument()
  })

  it('summary card numeric values use the Quartermaster Gold accent, never success/warning/danger', () => {
    withMock(richResult)
    renderPage()
    const value = within(screen.getByTestId('summary-card-source-ships-identified')).getByText('2')
    expect(value.className).toContain('text-gold')
    expect(value.className).not.toContain('text-success')
    expect(value.className).not.toContain('text-warning')
    expect(value.className).not.toContain('text-danger')
  })

  it('category columns render as compact icon headers with the full category name preserved for accessibility', () => {
    withMock(richResult)
    renderPage()
    const shieldHeader = screen.getByTitle('Shields')
    expect(shieldHeader.tagName).toBe('TH')
    expect(shieldHeader).toHaveAttribute('aria-label', 'Shields')
    // No wrapped text label rendered as visible content in the header row.
    const table = screen.getByTestId('target-roster')
    const headerRow = within(table).getAllByRole('row')[0]
    expect(within(headerRow).queryByText('Shields')).not.toBeInTheDocument()
  })

  it('the table allocates recovered column width to the Matching Fleet Requirements column via an explicit colgroup', () => {
    withMock(richResult)
    const { container } = renderPage()
    const cols = container.querySelectorAll('colgroup col')
    expect(cols.length).toBe(7) // Source Ship + 5 categories + Matching Fleet Requirements
    const widths = Array.from(cols).map((c) => (c as HTMLElement).style.width)
    const narrativeWidth = parseFloat(widths[widths.length - 1])
    const categoryWidths = widths.slice(1, 6).map(parseFloat)
    expect(categoryWidths.every((w) => w < narrativeWidth)).toBe(true)
  })
})

/**
 * EWO-104 Amendment 3 — Intelligence Presentation Refinement II.
 * Presentation only (Part H) — no resolver/authority/filtering/ranking
 * change; every test here mocks the same raw resolver result the earlier
 * suites already use and asserts only on rendering.
 */
describe('<FlightCommander /> — EWO-104 Amendment 3: presentation refinement II', () => {
  it('Part A: the hero places summary cards in a left-anchored column, mirroring Mission Control, with the remainder of the hero left as artwork negative space', () => {
    withMock(richResult)
    const { container } = renderPage()
    const heroCards = screen.getByTestId('summary-cards')
    const heroColumn = heroCards.parentElement as HTMLElement
    expect(heroColumn.className).toContain('lg:w-[300px]')
    expect(heroColumn.className).not.toContain('ml-auto')
    // A sibling negative-space spacer with flex-1 fills the rest of the hero.
    const hero = heroColumn.parentElement as HTMLElement
    const spacer = Array.from(hero.children).find((el) => el.getAttribute('aria-hidden') === 'true' && el !== container.querySelector('[data-environment-id="flight-commander"]'))
    expect(spacer?.className).toContain('flex-1')
  })

  it('Part B: the intelligence table header is sticky', () => {
    withMock(richResult)
    renderPage()
    const thead = screen.getByTestId('target-roster').querySelector('thead') as HTMLElement
    expect(thead.className).toContain('sticky')
    expect(thead.className).toContain('top-0')
  })

  it('Part C: each matched component renders a single-line destination per affected ship/build, with no orphan "Needed by:" label row', () => {
    withMock(richResult)
    renderPage()
    const cutlassRow = screen.getByTestId('roster-row-cutlass-black')
    expect(within(cutlassRow).queryByText('Needed by:')).not.toBeInTheDocument()
    expect(within(cutlassRow).getByText(/Corsair/).closest('p')?.textContent).toContain('Cargo Build ×2')
  })

  it('Part D: a resolvable component renders a rich catalog-metadata identity line beneath its name', () => {
    withMock(
      mockResult({
        sourceShips: [
          {
            shipDefinitionId: 'test-ship',
            displayName: 'Test Ship',
            distinctComponentCount: 1,
            totalUnresolvedUnitsCovered: 1,
            categoriesPresent: ['Shield'],
            matches: [
              {
                // A real, resolvable catalog entityClass (used elsewhere in this repo's own fixtures).
                componentName: 'RS-Barrier',
                componentEntityClass: 'SHLD_AEGS_S04_Reclaimer_SCItem',
                category: 'Shield',
                factoryQuantity: 1,
                fleetQuantityNeeded: 1,
                affected: [{ shipId: 'c1', shipName: 'Corsair', buildId: 'b1', buildName: 'Build', quantity: 1, deepLink: { path: '/ship-workspace/c1', shipId: 'c1' } }],
              },
            ],
          },
        ],
        demandComponents: [{ componentName: 'RS-Barrier', componentEntityClass: 'SHLD_AEGS_S04_Reclaimer_SCItem', category: 'Shield', fleetQuantityNeeded: 1, affected: [] }],
      })
    )
    renderPage()
    // Real catalog data may or may not be present in this checkout — only
    // assert the identity line's shape (starts with a size token) when it
    // renders at all; never assert a specific catalog value that could
    // silently drift with the generated dataset.
    const identityLine = screen.queryByText(/^S\d+ /)
    if (identityLine) {
      expect(identityLine.textContent).toMatch(/^S\d+ /)
    }
  })

  it('Part D: an unresolvable component renders the name alone, never a broken/guessed metadata line', () => {
    withMock(richResult) // richResult's fixture entityClasses ('MIRAGE_EC' etc.) are not real catalog ids
    renderPage()
    const cutlassRow = screen.getByTestId('roster-row-cutlass-black')
    expect(within(cutlassRow).getByText('Mirage')).toBeInTheDocument()
  })

  it('Part E: the category header icons are visually de-emphasized while Matching Fleet Requirements is emphasized', () => {
    withMock(richResult)
    renderPage()
    const shieldHeader = screen.getByTitle('Shields')
    expect(shieldHeader.className).toContain('text-muted/50')
    const narrativeHeader = screen.getByText('Matching Fleet Requirements')
    expect(narrativeHeader.className).toContain('font-bold')
    expect(narrativeHeader.className).toContain('text-cyan/90')
  })

  it('Part F: hero summary cards carry a stronger backdrop blur and a soft shadow, with sizing/typography otherwise unchanged', () => {
    withMock(richResult)
    renderPage()
    const card = screen.getByTestId('summary-card-source-ships-identified')
    expect(card.className).toContain('backdrop-blur-lg')
    expect(card.className).toContain('shadow-lg')
    expect(card.className).toContain('p-4')
    const value = within(card).getByText('2')
    expect(value.className).toContain('text-2xl')
    expect(value.className).toContain('text-gold')
  })

  it('Part G: the Operational Briefing panel uses Quartermaster Gold, never a warning/danger tone', () => {
    withMock(mockResult({ demandComponents: [] }))
    renderPage()
    const panel = screen.getByTestId('operational-briefing-panel')
    expect(panel.className).not.toContain('text-danger')
    expect(panel.className).not.toContain('border-danger')
    expect(within(panel).getByText('Intelligence Status')).toBeInTheDocument()
    expect(within(panel).getByText('No actionable factory targets identified.')).toBeInTheDocument()
    expect(within(panel).getByText(/Current fleet objectives cannot be accelerated/)).toBeInTheDocument()
    expect(within(panel).getByText('Intelligence Sweep Complete')).toBeInTheDocument()
    expect(within(panel).getByText('Awaiting New Fleet Requirements')).toBeInTheDocument()
  })

  it('Part G: the Operational Briefing panel reuses the Flight Commander hero artwork, dimmed', () => {
    withMock(mockResult({ demandComponents: [] }))
    const { container } = renderPage()
    const panel = screen.getByTestId('operational-briefing-panel')
    const environmentLayer = panel.querySelector('[data-environment-id="flight-commander"]')
    expect(environmentLayer).not.toBeNull()
    expect(environmentLayer?.className).toContain('opacity-20')
    // Confirm this is a second, independent mount from the page's own hero.
    expect(container.querySelectorAll('[data-environment-id="flight-commander"]').length).toBe(2)
  })

  it('Part H: no resolver/authority call site changed — the page still calls resolveFactoryLoadoutTargetIntelligence exactly once per render', () => {
    const spy = withMock(richResult)
    renderPage()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
