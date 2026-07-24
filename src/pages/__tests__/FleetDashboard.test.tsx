import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FleetDashboard from '../FleetDashboard'
import { useFleetStore } from '../../store/useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

function renderDashboard() {
  return render(
    <MemoryRouter>
      <FleetDashboard />
    </MemoryRouter>
  )
}

describe('<FleetDashboard /> — Mission M-012 empty-state', () => {
  it('8. renders a valid, deliberate empty state with zero ships (not a blank page or crash)', () => {
    useFleetStore.setState({ ships: [] })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderDashboard()
    expect(screen.getByText('No Vessels Assigned')).toBeInTheDocument()
    expect(screen.getByText('Your fleet manifest is currently empty.')).toBeInTheDocument()
    expect(screen.getByText('Add First Ship')).toBeInTheDocument()
    // 10. no console errors in the empty state.
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('still renders normally (card grid) when ships are present', () => {
    renderDashboard()
    expect(screen.queryByText('No Vessels Assigned')).not.toBeInTheDocument()
  })
})

/**
 * EWO-033 (Task 1/10) — Fleet Dashboard now shows a Priority wrapper above
 * every Card-view Fleet Asset at all times (not only while Priority sort
 * is selected), reading that ship's own stored `priority` field — never a
 * recomputed positional rank, so it stays correct after any sort/filter.
 */
describe('<FleetDashboard /> — EWO-033 (Task 1): Priority presentation', () => {
  it('1. a Priority label renders for every Card-view Fleet Asset', () => {
    renderDashboard()
    const { ships } = useFleetStore.getState()
    expect(screen.getAllByTestId('priority-card-wrapper')).toHaveLength(ships.length)
  })

  it('2. each label matches the correct Fleet Asset\'s own stored priority value', () => {
    renderDashboard()
    const { ships } = useFleetStore.getState()
    for (const ship of ships) {
      const card = screen.getByText(ship.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
      expect(within(card).getByText(`PRIORITY ${ship.priority}`)).toBeInTheDocument()
    }
  })

  it('3. labels remain correct after sorting by Priority', () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Priority' }))
    const { ships } = useFleetStore.getState()
    for (const ship of ships) {
      const card = screen.getByText(ship.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
      expect(within(card).getByText(`PRIORITY ${ship.priority}`)).toBeInTheDocument()
    }
  })

  it('4. labels remain correct after sorting by Readiness (never recomputed to a positional 1..N)', () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Readiness' }))
    const { ships } = useFleetStore.getState()
    for (const ship of ships) {
      const card = screen.getByText(ship.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
      expect(within(card).getByText(`PRIORITY ${ship.priority}`)).toBeInTheDocument()
    }
  })

  it('5. labels remain correct after filtering by ownership', () => {
    renderDashboard()
    const { ships } = useFleetStore.getState()
    fireEvent.click(screen.getByRole('button', { name: 'Owned' }))
    const owned = ships.filter((s) => s.ownership === 'Owned')
    expect(screen.getAllByTestId('priority-card-wrapper')).toHaveLength(owned.length)
    for (const ship of owned) {
      const card = screen.getByText(ship.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
      expect(within(card).getByText(`PRIORITY ${ship.priority}`)).toBeInTheDocument()
    }
  })

  it('6. the entire card remains clickable — the Priority wrapper does not intercept or replace the card link', () => {
    renderDashboard()
    const { ships } = useFleetStore.getState()
    const first = ships[0]
    const card = screen.getByText(first.name).closest('[data-testid="priority-card-wrapper"]') as HTMLElement
    const link = within(card).getByRole('link')
    expect(link).toHaveAttribute('href', `/ship-workspace/${first.id}`)
  })

  it('7. Table view remains functional and unaffected (no Priority column added, per "report don\'t redesign" instruction)', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    expect(screen.getByText('Ship')).toBeInTheDocument()
    expect(screen.getByText('Active Loadout')).toBeInTheDocument()
    expect(screen.queryByTestId('priority-card-wrapper')).not.toBeInTheDocument()
  })
})

describe('EWO-053 (Objective B — Fleet Navigation Refactor): composable, independent filter dimensions', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  function tableShipNamesInOrder(): string[] {
    return Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.querySelector('td')!.textContent ?? '')
  }

  // Uses the real seed fleet, not a fabricated fixture — MOLE (canonical
  // manufacturer 'Argo', RSI role Industrial) alongside Vulture (Drake,
  // Industrial) and Prospector (MISC, Industrial) is the exact "Industrial
  // ships built by Argo" success-criterion example, already present in
  // src/data/seed.ts.
  it('the RSI Role filter alone shows every Industrial ship regardless of manufacturer (Mole, Vulture, Prospector)', () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    expect(screen.getByText('MOLE')).toBeInTheDocument()
    expect(screen.getByText('Vulture')).toBeInTheDocument()
    expect(screen.getByText('Prospector')).toBeInTheDocument()
  })

  it('the Manufacturer filter alone shows every ARGO ship regardless of role', () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Argo' }))
    expect(screen.getByText('MOLE')).toBeInTheDocument()
    expect(screen.queryByText('Vulture')).not.toBeInTheDocument()
    expect(screen.queryByText('Prospector')).not.toBeInTheDocument()
  })

  it('Composable Filters: Industrial + ARGO composes (AND), narrowing to exactly the ships both dimensions agree on — not replacing one filter with the other', () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Argo' }))
    expect(screen.getByText('MOLE')).toBeInTheDocument()
    expect(screen.queryByText('Vulture')).not.toBeInTheDocument()
    expect(screen.queryByText('Prospector')).not.toBeInTheDocument()
    // Both pills stay visibly active at once — proof this is two
    // independent dimensions, not a single mutually-exclusive selector.
    expect(screen.getByRole('button', { name: 'Industrial' })).toHaveClass('bg-cyan/15')
    expect(screen.getByRole('button', { name: 'Argo' })).toHaveClass('bg-cyan/15')
  })

  it('Clear Filters resets every dimension at once and disappears once nothing is active', () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    fireEvent.click(screen.getByRole('button', { name: 'Argo' }))
    expect(screen.getByText('Clear Filters')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Clear Filters'))
    expect(screen.queryByText('Clear Filters')).not.toBeInTheDocument()
    expect(screen.getByText('Vulture')).toBeInTheDocument() // Industrial ships other than ARGO are visible again
  })

  it('Sorting by Manufacturer orders the Table view by each ship\'s own canonical manufacturer name', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    fireEvent.click(screen.getByRole('button', { name: 'Manufacturer' }))
    const names = tableShipNamesInOrder()
    const { ships } = useFleetStore.getState()
    const expectedOrder = [...ships].sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.name.localeCompare(b.name)).map((s) => s.name)
    expect(names).toEqual(expectedOrder)
  })

  it('Sorting by Ship Name orders the Table view alphabetically', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    fireEvent.click(screen.getByRole('button', { name: 'Ship Name' }))
    const names = tableShipNamesInOrder()
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('Sorting by RSI Role never crashes and produces a stable, fully-ordered result for every ship, including those with no classified role', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'RSI Role' }))).not.toThrow()
    const { ships } = useFleetStore.getState()
    expect(tableShipNamesInOrder()).toHaveLength(ships.length)
  })

  it('a Readiness filter narrows to only Factory-only Loadouts (135c, UTV) when "Factory Only" is selected', () => {
    renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Factory Only' }))
    expect(screen.getByText('135c')).toBeInTheDocument()
    expect(screen.getByText('UTV')).toBeInTheDocument()
    expect(screen.queryByText('MOLE')).not.toBeInTheDocument()
  })

  it('Persistent View: a filter set before navigating away is still active the next time Fleet Dashboard mounts (session persistence)', () => {
    const { unmount } = renderDashboard()
    fireEvent.click(screen.getByRole('button', { name: 'Industrial' }))
    expect(screen.queryByText('Vulture')).toBeInTheDocument()
    expect(screen.queryByText('Prospector')).toBeInTheDocument()
    unmount()

    renderDashboard()
    // Still filtered to Industrial only — the Commander never has to
    // re-apply a filter after visiting Ship Detail and coming back.
    expect(screen.queryByText('135c')).not.toBeInTheDocument()
    expect(screen.getByText('MOLE')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Industrial' })).toHaveClass('bg-cyan/15')
  })
})
