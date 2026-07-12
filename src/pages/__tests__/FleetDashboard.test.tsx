import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
