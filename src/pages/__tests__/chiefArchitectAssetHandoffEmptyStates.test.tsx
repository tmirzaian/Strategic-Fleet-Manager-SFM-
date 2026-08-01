import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MissionControl from '../MissionControl'
import FleetDashboard from '../FleetDashboard'
import HangarInventory from '../HangarInventory'
import CaptainsLog from '../CaptainsLog'
import { useFleetStore } from '../../store/useFleetStore'
import type { HangarItem, Ship } from '../../types'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

/** `PageEnvironment` stamps `data-environment-id` on its root layer —
 * the one reliable, implementation-level signal that a given
 * environment actually rendered (as opposed to degrading to `null`). */
function environmentLayer(id: string): HTMLElement | null {
  return document.querySelector(`[data-environment-id="${id}"]`)
}

/**
 * Chief Architect Asset Handoff — bounded empty-state environments
 * (Mission Control/Fleet Dashboard/Hangar Inventory) and the Captain's
 * Log certification-card CSS accent. Proves the artwork appears ONLY in
 * the genuine-empty branch of each page — never a sibling "filtered to
 * zero"/"all retired" state, and never the ordinary populated view —
 * while every existing text/action/accessibility behavior stays intact
 * (the existing MissionControl.test.tsx/FleetDashboard.test.tsx/
 * HangarInventory.test.tsx/CaptainsLog.test.tsx suites already assert on
 * that unchanged text; this file only adds the new artwork-scoping
 * assertions).
 */
describe('Chief Architect Asset Handoff — Mission Control empty Top Priority Ship', () => {
  it('renders the mission-control-empty-priority environment only when ships.length === 0, at a compact (not 560px) height', () => {
    useFleetStore.setState({ ships: [] })
    renderWithRouter(<MissionControl />)

    expect(screen.getByText('No Vessels Assigned')).toBeInTheDocument()
    expect(screen.getByText('Add First Ship')).toBeInTheDocument()
    const layer = environmentLayer('mission-control-empty-priority')
    expect(layer).not.toBeNull()
    // The bay wrapper (the environment layer's parent) carries the
    // compact override, never the standard 560px department-room height.
    expect(layer!.parentElement!.className).toContain('lg:min-h-[300px]')
    expect(layer!.parentElement!.className).not.toContain('lg:min-h-[560px]')
  })

  it('does not render the empty-priority environment when the fleet is populated', () => {
    renderWithRouter(<MissionControl />) // real seed fleet, non-empty
    expect(environmentLayer('mission-control-empty-priority')).toBeNull()
  })
})

const retiredShip = (id: string): Ship => ({
  id,
  name: `Retired ${id}`,
  manufacturer: 'M',
  ownership: 'Owned',
  career: '',
  role: '',
  activeBuildId: 'b',
  readiness: 0,
  priority: null,
  missing: [],
  lifecycleStatus: 'retired',
})

describe('Chief Architect Asset Handoff — Fleet Dashboard empty state', () => {
  it('renders the fleet-dashboard-empty environment for a genuinely empty fleet (no ships anywhere)', () => {
    useFleetStore.setState({ ships: [] })
    renderWithRouter(<FleetDashboard />)

    expect(screen.getByText('No Vessels Assigned')).toBeInTheDocument()
    expect(environmentLayer('fleet-dashboard-empty')).not.toBeNull()
  })

  it('does NOT render artwork for the "every vessel is retired" state', () => {
    useFleetStore.setState({ ships: [retiredShip('r1'), retiredShip('r2')] })
    renderWithRouter(<FleetDashboard />)

    expect(screen.getByText('No Active Vessels')).toBeInTheDocument()
    expect(environmentLayer('fleet-dashboard-empty')).toBeNull()
  })

  it('does NOT render artwork for the Retired-tab-with-nothing-retired state', () => {
    useFleetStore.setState({ ships: [] })
    renderWithRouter(<FleetDashboard />)
    fireEvent.click(screen.getByRole('button', { name: 'Retired' }))

    expect(screen.getByText('No Retired Vessels')).toBeInTheDocument()
    expect(environmentLayer('fleet-dashboard-empty')).toBeNull()
  })

  it('does not render the empty environment when the fleet is populated', () => {
    renderWithRouter(<FleetDashboard />) // real seed fleet, non-empty
    expect(environmentLayer('fleet-dashboard-empty')).toBeNull()
  })
})

describe('Chief Architect Asset Handoff — Hangar Inventory empty state', () => {
  it('renders the hangar-inventory-empty environment when genuinely zero items are recorded', () => {
    useFleetStore.setState({ hangarItems: [] })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderWithRouter(<HangarInventory />)

    expect(screen.getByText('No Inventory Recorded')).toBeInTheDocument()
    expect(environmentLayer('hangar-inventory-empty')).not.toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('does not render the empty environment when inventory is populated (proxy for the filtered-to-zero exclusion: artwork never leaks into the non-genuinely-empty render path)', () => {
    const item: HangarItem = { id: 'h1', name: 'SnowBlind', type: 'Cooler', size: 'S1', qty: 1, neededBy: '', disposition: 'Store' }
    useFleetStore.setState({ hangarItems: [item] })
    renderWithRouter(<HangarInventory />)
    expect(environmentLayer('hangar-inventory-empty')).toBeNull()
  })
})

describe("Chief Architect Asset Handoff — Captain's Log certification accent", () => {
  it('renders a decorative, low-opacity CSS background layer inside the certification card — never EnvironmentBay/PageEnvironment, never an <img>', () => {
    renderWithRouter(<CaptainsLog />)

    // Never routed through the environment/bay system for this card.
    expect(environmentLayer('captains-log-certification')).toBeNull()
    expect(document.querySelector('[data-environment-id]')).toBeNull()

    const certHeading = screen.getByText(/Strategic Fleet Manager/)
    const card = certHeading.closest('.panel') as HTMLElement
    expect(card).not.toBeNull()

    const accentLayer = card.querySelector('[aria-hidden="true"]') as HTMLElement
    expect(accentLayer).not.toBeNull()
    expect(accentLayer.tagName).toBe('DIV') // CSS layer, not <img>
    expect(accentLayer.style.backgroundImage).toContain('captains-log-certification-accent-1600.webp')
    expect(accentLayer.style.backgroundPosition).toBe('left center')
    expect(accentLayer.style.backgroundSize).toBe('cover')
    expect(Number(accentLayer.style.opacity)).toBeCloseTo(0.18, 5)
    expect(Number(accentLayer.style.opacity)).toBeGreaterThanOrEqual(0.15)
    expect(Number(accentLayer.style.opacity)).toBeLessThanOrEqual(0.2)
  })

  it('existing certification text stays present and visually stacked above the accent layer', () => {
    renderWithRouter(<CaptainsLog />)
    const certHeading = screen.getByText(/Strategic Fleet Manager/)
    expect(certHeading).toBeInTheDocument()
    expect(screen.getByText('Certified for')).toBeInTheDocument()
    // The text wrapper sits above the decorative layer (z-index), not
    // beside or instead of it.
    const textWrapper = certHeading.parentElement as HTMLElement
    expect(textWrapper.className).toContain('relative')
    expect(textWrapper.className).toContain('z-10')
  })
})
