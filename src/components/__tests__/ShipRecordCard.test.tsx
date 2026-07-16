import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ShipRecordCard from '../ShipRecordCard'
import type { Ship } from '../../types'
import type { BuildProgressResult } from '../../utils/buildProgress'
import { SHIP_PLACEHOLDER_URL } from '../../constants/shipImage'
import { FLEET_REGISTRY_PLACEHOLDER } from '../../config/assets'

afterEach(() => cleanup())

const baseShip: Ship = {
  id: 'ghost',
  name: 'F7C-S Hornet Ghost Mk II',
  manufacturer: 'Anvil',
  ownership: 'Owned',
  career: 'Combat',
  role: 'Stealth Fighter',
  activeBuildId: 'ghost-stealth',
  readiness: 82,
  priority: 1,
  missing: [],
}

const incompleteProgress: BuildProgressResult = {
  percentage: 78,
  matchedAssignments: 6,
  requiredAssignments: 8,
  missingAssignments: ['Slipstream'],
  mismatchedAssignments: [],
  invalidTargets: [],
  upgradeOpportunities: [],
  unresolvedAssignments: [],
  isComplete: false,
  status: 'NEAR_READY',
}

function renderCard(ship: Ship = baseShip, progress: BuildProgressResult = incompleteProgress, badge?: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ShipRecordCard ship={ship} buildName="Stealth Build" progress={progress} badge={badge} />
    </MemoryRouter>
  )
}

describe('<ShipRecordCard /> — EWO-012 canonical Fleet Registry Record (DA-010)', () => {
  it('6. remains generic — renders with no Mission-Control-specific concept when no badge is supplied', () => {
    renderCard(baseShip, incompleteProgress, undefined)
    expect(screen.queryByText(/PRIORITY/)).not.toBeInTheDocument()
    expect(screen.getByText(baseShip.name)).toBeInTheDocument()
  })

  it('renders the vessel image inside the same record box as the metadata — no separate image panel', () => {
    const { container } = renderCard()
    const card = container.firstElementChild as HTMLElement
    // The art layer is decorative (empty alt, aria-hidden) so it's queried
    // directly rather than via role.
    const img = card.querySelector('img')
    expect(img).not.toBeNull()
    expect(card.contains(img)).toBe(true)
    // No hard divider between the art and the information.
    expect(card.querySelector('[class*="divide-"]')).toBeNull()
  })

  it('marks the art layer decorative and non-interactive — aria-hidden, empty alt, no pointer events', () => {
    const { container } = renderCard()
    const artLayer = container.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(artLayer).not.toBeNull()
    expect(artLayer.className).toContain('pointer-events-none')
    const img = artLayer.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('alt')).toBe('')
  })

  it('preserves the information hierarchy: badge, name, role, loadout, readiness, Ship Detail', () => {
    renderCard(baseShip, incompleteProgress, <span>PRIORITY 1</span>)
    const card = screen.getByText(baseShip.name).closest('.panel') as HTMLElement
    const nodes = [
      within(card).getByText('PRIORITY 1'),
      within(card).getByText(baseShip.name),
      within(card).getByText(baseShip.role),
      within(card).getByText('Loadout: Stealth Build'),
      within(card).getByText('Readiness'),
      within(card).getByText('Ship Detail'),
    ]
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('8/9. uses the semantic Fleet Registry placeholder as fallback, never the obsolete presentation-board asset', () => {
    const { container } = renderCard({ ...baseShip, imageUrl: undefined })
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe(FLEET_REGISTRY_PLACEHOLDER)
    expect(img!.getAttribute('src')).not.toBe(SHIP_PLACEHOLDER_URL)
  })

  it('11. renders a Ship Detail action linking to the ship route', () => {
    renderCard()
    const link = screen.getByText('Ship Detail').closest('a')
    expect(link).toHaveAttribute('href', '/ship/ghost')
  })

  it('shows a Mission Ready state instead of a readiness bar when the build is complete', () => {
    renderCard(baseShip, { ...incompleteProgress, percentage: 100, isComplete: true, status: 'COMPLETE' })
    expect(screen.getByText('Mission Ready')).toBeInTheDocument()
    expect(screen.queryByText('Readiness')).not.toBeInTheDocument()
  })
})

describe('<ShipRecordCard /> — EWO-013 Alpha data contract audit + density pass', () => {
  it('1. every required field renders: ship name, role, active loadout, readiness state, Ship Detail', () => {
    renderCard()
    expect(screen.getByText(baseShip.name)).toBeInTheDocument()
    expect(screen.getByText(baseShip.role)).toBeInTheDocument()
    expect(screen.getByText('Loadout: Stealth Build')).toBeInTheDocument()
    expect(screen.getByText('Readiness')).toBeInTheDocument()
    expect(screen.getByText('Ship Detail')).toBeInTheDocument()
  })

  it('2. the conditional future progress-detail hardpoint reserves no permanent empty gap when absent — the content layer holds only its currently-real fields', () => {
    renderCard()
    const contentLayer = screen.getByText(baseShip.name).closest('.max-w-\\[78\\%\\]') as HTMLElement
    // badge (absent here) + name + role + loadout + readiness block + Ship
    // Detail link = at most 5 real children today; no extra empty wrapper
    // div is reserved for the not-yet-implemented progress detail.
    expect(contentLayer.children.length).toBe(5)
  })

  it("does not reserve a visible empty region for manufacturer, ownership, career, or last-updated — fields excluded from the approved Alpha hierarchy", () => {
    const shipWithExtraData: Ship = { ...baseShip, manufacturer: 'Anvil', ownership: 'Owned', career: 'Combat', lastUpdated: '6 days ago' }
    renderCard(shipWithExtraData)
    expect(screen.queryByText('Anvil')).not.toBeInTheDocument()
    expect(screen.queryByText('6 days ago')).not.toBeInTheDocument()
  })
})
