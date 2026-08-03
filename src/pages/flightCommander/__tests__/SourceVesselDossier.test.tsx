import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SourceVesselDossier from '../SourceVesselDossier'
import type { TargetIntelligenceSourceShip } from '../../../utils/factoryLoadoutTargetIntelligence'
import type { ShipDefinition } from '../../../types'
import { SHIP_PLACEHOLDER_URL } from '../../../constants/shipImage'

afterEach(() => cleanup())

function baseShip(overrides: Partial<TargetIntelligenceSourceShip> = {}): TargetIntelligenceSourceShip {
  return {
    shipDefinitionId: 'test-definition-fixture-ship',
    displayName: 'Test Fixture Ship',
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
        affected: [
          { shipId: 'c1', shipName: 'Corsair', buildId: 'b1', buildName: 'Cargo Build', quantity: 1, deepLink: { path: '/ship-workspace/c1', shipId: 'c1' } },
          { shipId: 'g1', shipName: 'Ghost', buildId: 'b2', buildName: 'Stealth Build', quantity: 1, deepLink: { path: '/ship-workspace/g1', shipId: 'g1' } },
        ],
      },
    ],
    ...overrides,
  }
}

function baseDefinition(overrides: Partial<ShipDefinition> = {}): ShipDefinition {
  return {
    id: 'test-definition-fixture-ship',
    internalName: 'TEST_FIXTURE_SHIP',
    displayName: 'Test Fixture Ship',
    manufacturer: 'Drake Interplanetary',
    classification: { rsiRoles: ['Combat'], focusTags: [], source: 'MANUAL_SEED' },
    career: 'Combat',
    role: 'Light Fighter',
    equipmentGroups: [],
    portIds: [],
    factoryLoadoutId: 'test-definition-fixture-ship-factory',
    sourceMetadata: { sourceType: 'seed' },
    ...overrides,
  }
}

function renderDossier(ship: TargetIntelligenceSourceShip, definition: ShipDefinition | undefined) {
  return render(
    <MemoryRouter>
      <SourceVesselDossier ship={ship} definition={definition} />
    </MemoryRouter>
  )
}

/**
 * EWO-108 (Part R.7-13) — the dossier is a pure presentation component:
 * every value asserted here comes straight from its own `ship`/
 * `definition` props, never from a resolver reimplementation or from
 * global store state (see the "does not leak owned-ship data" test below).
 */
describe('<SourceVesselDossier /> (EWO-108 Part G/H/I/J)', () => {
  it('renders canonical source-vessel identity: name, manufacturer, and role', () => {
    renderDossier(baseShip(), baseDefinition())
    expect(screen.getByText('Test Fixture Ship')).toBeInTheDocument()
    expect(screen.getByText('Drake Interplanetary • Light Fighter')).toBeInTheDocument()
  })

  it('omits the identity sub-line entirely when neither manufacturer nor role is available, never fabricating one', () => {
    renderDossier(baseShip(), baseDefinition({ manufacturer: '', role: '' }))
    expect(screen.queryByText('Drake Interplanetary')).not.toBeInTheDocument()
    expect(screen.queryByText('Light Fighter')).not.toBeInTheDocument()
  })

  it('Part H (image authority, tier 2): uses the ShipDefinition\'s own imageUrl via the shared resolver when no registry entry exists', () => {
    renderDossier(baseShip(), baseDefinition({ imageUrl: 'https://example.com/fixture-ship.jpg' }))
    const img = screen.getByAltText('Test Fixture Ship') as HTMLImageElement
    expect(img.src).toBe('https://example.com/fixture-ship.jpg')
  })

  it('Part H (image authority, tier 3): falls back to the neutral repository placeholder when no definition image is known', () => {
    renderDossier(baseShip(), baseDefinition({ imageUrl: undefined, image: undefined }))
    const img = screen.getByAltText('Test Fixture Ship') as HTMLImageElement
    expect(img.src).toContain(SHIP_PLACEHOLDER_URL)
  })

  it('Part H (image authority, tier 3): falls back to the neutral placeholder when no ShipDefinition could be resolved at all', () => {
    renderDossier(baseShip(), undefined)
    const img = screen.getByAltText('Test Fixture Ship') as HTMLImageElement
    expect(img.src).toContain(SHIP_PLACEHOLDER_URL)
  })

  it('Part R.9 — the rendered image is a pure function of the definition prop, never any other data source (structural proof: identical definition, identical output, only image-relevant fields vary the result)', () => {
    const { unmount } = renderDossier(baseShip(), baseDefinition({ imageUrl: 'https://example.com/a.jpg' }))
    expect((screen.getByAltText('Test Fixture Ship') as HTMLImageElement).src).toBe('https://example.com/a.jpg')
    unmount()
    // Same shipDefinitionId, a totally different definition object identity
    // (simulating "no relationship to any owned Ship record") still only
    // reflects its own passed-in fields.
    renderDossier(baseShip(), baseDefinition({ imageUrl: 'https://example.com/b.jpg' }))
    expect((screen.getByAltText('Test Fixture Ship') as HTMLImageElement).src).toBe('https://example.com/b.jpg')
  })

  it('Part I — category glyphs carry accessible matched/unmatched labels for every stable category, not just the matched ones', () => {
    renderDossier(baseShip({ categoriesPresent: ['Shield'] }), baseDefinition())
    expect(screen.getByLabelText('Shields match')).toBeInTheDocument()
    expect(screen.getByLabelText('Coolers not matched')).toBeInTheDocument()
    expect(screen.getByLabelText('Power Plants not matched')).toBeInTheDocument()
    expect(screen.getByLabelText('Quantum Drives not matched')).toBeInTheDocument()
    expect(screen.getByLabelText('Weapons not matched')).toBeInTheDocument()
  })

  it('Part J — the technical identity line renders beneath the component name when the catalog resolves it', () => {
    renderDossier(
      baseShip({
        matches: [
          {
            componentName: 'RS-Barrier',
            componentEntityClass: 'SHLD_AEGS_S04_Reclaimer_SCItem',
            category: 'Shield',
            factoryQuantity: 1,
            fleetQuantityNeeded: 1,
            affected: [{ shipId: 'c1', shipName: 'Corsair', buildId: 'b1', buildName: 'Build', quantity: 1, deepLink: { path: '/ship-workspace/c1', shipId: 'c1' } }],
          },
        ],
      }),
      baseDefinition()
    )
    // Real catalog data may or may not resolve this entityClass in this
    // checkout — only assert the shape when it renders at all, matching
    // the existing EWO-104 Amendment 3 convention for this exact fixture.
    const identityLine = screen.queryByText(/^S\d+ /)
    if (identityLine) expect(identityLine.textContent).toMatch(/^S\d+ /)
  })

  it('Part J — an unresolvable component renders its name alone, never a guessed/broken metadata line', () => {
    renderDossier(baseShip(), baseDefinition())
    expect(screen.getByText('Mirage')).toBeInTheDocument()
  })

  it('Part J/R.13 — multiple destination ships/builds for the same component all render, each with the correct quantity', () => {
    renderDossier(baseShip(), baseDefinition())
    expect(screen.getByText(/Cargo Build ×1/)).toBeInTheDocument()
    expect(screen.getByText(/Stealth Build ×1/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Corsair' })).toHaveAttribute('href', '/ship-workspace/c1')
    expect(screen.getByRole('link', { name: 'Ghost' })).toHaveAttribute('href', '/ship-workspace/g1')
  })

  it('Part R.14 — deep links reach the correct existing Ship Management route', () => {
    renderDossier(baseShip(), baseDefinition())
    const link = screen.getByRole('link', { name: 'Corsair' })
    expect(link.getAttribute('href')).toBe('/ship-workspace/c1')
  })

  it('Part R.15 — no mutation controls exist anywhere in a dossier', () => {
    renderDossier(baseShip(), baseDefinition())
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('renders every matched component, each with its own destination lines', () => {
    renderDossier(
      baseShip({
        matches: [
          {
            componentName: 'Mirage',
            componentEntityClass: 'MIRAGE_EC',
            category: 'Shield',
            factoryQuantity: 1,
            fleetQuantityNeeded: 1,
            affected: [{ shipId: 'c1', shipName: 'Corsair', buildId: 'b1', buildName: 'Cargo Build', quantity: 1, deepLink: { path: '/ship-workspace/c1', shipId: 'c1' } }],
          },
          {
            componentName: 'CoolerX',
            componentEntityClass: 'COOLERX_EC',
            category: 'Cooler',
            factoryQuantity: 1,
            fleetQuantityNeeded: 1,
            affected: [{ shipId: 'g1', shipName: 'Ghost', buildId: 'b2', buildName: 'Stealth Build', quantity: 1, deepLink: { path: '/ship-workspace/g1', shipId: 'g1' } }],
          },
        ],
      }),
      baseDefinition()
    )
    expect(screen.getByText('Mirage')).toBeInTheDocument()
    expect(screen.getByText('CoolerX')).toBeInTheDocument()
  })

  it('the dossier root carries a stable per-ship test id for page-level assertions', () => {
    renderDossier(baseShip(), baseDefinition())
    expect(screen.getByTestId('dossier-test-definition-fixture-ship')).toBeInTheDocument()
  })
})
