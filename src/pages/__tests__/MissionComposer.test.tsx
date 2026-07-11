import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MissionComposer from '../MissionComposer'
import { useFleetStore } from '../../store/useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

function renderComposer(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/loadout-manager${search}`]}>
      <MissionComposer />
    </MemoryRouter>
  )
}

describe('<MissionComposer /> (Loadout Manager)', () => {
  it('renders the required starting-state options using Loadout terminology (Alpha 2.4)', () => {
    renderComposer()
    expect(screen.getAllByText('Factory').length).toBeGreaterThan(0)
    expect(screen.getByText('Current Installed Loadout')).toBeInTheDocument()
    expect(screen.getByText('Blank / Empty')).toBeInTheDocument()
    expect(screen.getByText('Clone Existing Loadout')).toBeInTheDocument()
  })

  it('pre-selects the Fleet Asset from a shipId query param', () => {
    renderComposer('?shipId=utv')
    const select = screen.getByDisplayValue(/UTV/i) as HTMLSelectElement
    expect(select.value).toBe('utv')
  })

  it('lists real Presets (formerly Quartermaster Templates) from the store, not mock data', () => {
    renderComposer()
    expect(screen.getAllByText('Stealth Recon').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Escort / Close Support').length).toBeGreaterThan(0)
  })

  it('shows the target equipment table with a row per reference slot', () => {
    renderComposer('?shipId=ghost')
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
    expect(screen.getByText('Shield 1')).toBeInTheDocument()
  })

  it('saving with a name creates a real Loadout (Build record) in the store', () => {
    renderComposer('?shipId=utv')
    const nameInput = screen.getByPlaceholderText(/Deep Salvage Run/i)
    fireEvent.change(nameInput, { target: { value: 'Test Composer Loadout' } })

    const saveButton = screen.getByText('Save Loadout')
    fireEvent.click(saveButton)

    const created = useFleetStore.getState().builds.find((b) => b.name === 'Test Composer Loadout')
    expect(created).toBeDefined()
    expect(created?.kind).toBe('MISSION')
    expect(created?.shipId).toBe('utv')
  })

  it('Save & Set as Active Loadout makes the new configuration the ship\'s active build', () => {
    renderComposer('?shipId=utv')
    const nameInput = screen.getByPlaceholderText(/Deep Salvage Run/i)
    fireEvent.change(nameInput, { target: { value: 'Now Active Loadout' } })

    fireEvent.click(screen.getByText(/Save & Set as Active Loadout/i))

    const ship = useFleetStore.getState().ships.find((s) => s.id === 'utv')!
    const activeBuild = useFleetStore.getState().builds.find((b) => b.id === ship.activeBuildId)
    expect(activeBuild?.name).toBe('Now Active Loadout')
  })

  it('lists existing Loadouts across the fleet, merged from the retired Build Manager page', () => {
    renderComposer()
    expect(screen.getByText('Existing Loadouts')).toBeInTheDocument()
    expect(screen.getByText('Stealth Build')).toBeInTheDocument()
  })
})
