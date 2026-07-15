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
    expect(link).toHaveAttribute('href', `/ship/${first.id}`)
  })

  it('7. Table view remains functional and unaffected (no Priority column added, per "report don\'t redesign" instruction)', () => {
    renderDashboard()
    fireEvent.click(screen.getByText('Table'))
    expect(screen.getByText('Ship')).toBeInTheDocument()
    expect(screen.getByText('Active Loadout')).toBeInTheDocument()
    expect(screen.queryByTestId('priority-card-wrapper')).not.toBeInTheDocument()
  })
})
