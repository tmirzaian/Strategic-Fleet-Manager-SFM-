import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipDetail from '../ShipDetail'
import { useFleetStore } from '../../store/useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

function renderShipDetail(shipId: string) {
  return render(
    <MemoryRouter initialEntries={[`/ship/${shipId}`]}>
      <Routes>
        <Route path="/ship/:shipId" element={<ShipDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('<ShipDetail /> (Alpha 2.5C)', () => {
  it('1/2. shows a Readiness card, never a competing Installed Match / Package Readiness headline pair', () => {
    renderShipDetail('ghost')
    expect(screen.getByText('Readiness')).toBeInTheDocument()
    expect(screen.queryByText('Installed Match')).not.toBeInTheDocument()
    expect(screen.queryByText('Package Readiness')).not.toBeInTheDocument()
  })

  it('3. no readiness percentage renders inside the hero image area itself', () => {
    renderShipDetail('ghost')
    const heroArea = screen.getByTestId('ship-hero-image-area')
    expect(heroArea.textContent).not.toMatch(/^\d+%$/)
  })

  it('4. manufacturer logo renders top-left in the hero', () => {
    renderShipDetail('ghost')
    expect(screen.getByTitle('Anvil')).toBeInTheDocument()
  })

  it('7. a completed custom Loadout (Corsair) shows Mission Ready', () => {
    renderShipDetail('corsair')
    expect(screen.getByText('Mission Ready')).toBeInTheDocument()
  })

  it('8. a Factory Loadout ship (UTV) never receives Mission Ready certification treatment', () => {
    renderShipDetail('utv')
    expect(screen.getAllByText('Factory Loadout').length).toBeGreaterThan(0)
    expect(screen.queryByText('Mission Ready')).not.toBeInTheDocument()
  })

  it('10. the unified Loadout & Port Tree renders', () => {
    renderShipDetail('ghost')
    expect(screen.getByText('Loadout & Port Tree')).toBeInTheDocument()
  })

  it('11. every top-level normalized port renders for Railen (pilot weapons, turrets, tractor beams)', () => {
    renderShipDetail('railen')
    expect(screen.getByText('Pilot Weapon 1')).toBeInTheDocument()
    expect(screen.getByText('Pilot Weapon 4')).toBeInTheDocument()
    expect(screen.getByText('Port Turret')).toBeInTheDocument()
    expect(screen.getByText('Starboard Turret')).toBeInTheDocument()
    expect(screen.getByText('Fore Tractor Beam')).toBeInTheDocument()
  })

  it("12. Railen's turret child weapons are collapsed by default (not rendered until expansion)", () => {
    renderShipDetail('railen')
    expect(screen.queryByText('Port Turret Left Weapon')).not.toBeInTheDocument()
  })

  it('13. Expand All reveals nested turret child weapons', () => {
    renderShipDetail('railen')
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('Port Turret Left Weapon')).toBeInTheDocument()
    expect(screen.getByText('Starboard Turret Right Weapon')).toBeInTheDocument()
  })

  it('14. Collapse All hides descendants again after expanding', () => {
    renderShipDetail('railen')
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('Port Turret Left Weapon')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Collapse All'))
    expect(screen.queryByText('Port Turret Left Weapon')).not.toBeInTheDocument()
  })

  it('MOLE renders its mining turret hierarchy', () => {
    renderShipDetail('mole')
    expect(screen.getByText('Mining Turret 1')).toBeInTheDocument()
    expect(screen.getByText('Mining Turret 2')).toBeInTheDocument()
  })

  it('Vulture renders its salvage mount and tractor beam', () => {
    renderShipDetail('vulture')
    expect(screen.getByText('Salvage Mount')).toBeInTheDocument()
    expect(screen.getAllByText('Tractor Beam').length).toBeGreaterThan(0)
  })

  it('Cutlass Black renders its Top Turret and Tractor Beam', () => {
    renderShipDetail('cutlass-black')
    expect(screen.getByText('Top Turret')).toBeInTheDocument()
    expect(screen.getAllByText('Tractor Beam').length).toBeGreaterThan(0)
  })

  it('28. switching Active Loadout does not move equipment (Installed Loadout unchanged), only Target changes', () => {
    renderShipDetail('ghost')
    const installedBefore = useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')
    useFleetStore.getState().setActiveBuild('ghost', 'ghost-escort')
    const installedAfter = useFleetStore.getState().installedLoadouts.filter((e) => e.shipId === 'ghost')
    expect(installedAfter).toEqual(installedBefore)
  })

  it("Edit and Remove from Fleet actions remain present alongside Quick Update", () => {
    renderShipDetail('ghost')
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Remove from Fleet')).toBeInTheDocument()
    expect(screen.getByText('Quick Update')).toBeInTheDocument()
  })

  it('does not use Mission Configuration language in normal user-facing copy', () => {
    renderShipDetail('ghost')
    expect(screen.queryByText(/Mission Configuration/i)).not.toBeInTheDocument()
  })
})
