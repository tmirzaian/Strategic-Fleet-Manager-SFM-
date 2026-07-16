import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { useFleetStore } from '../store/useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

/**
 * EWO-026 (round 2, Task 4) — Navigation Flow Validation. Drives the real
 * `App` router end to end with real clicks (never a fresh `render()` per
 * page, which would trivially "fix" any client-navigation-only bug by
 * accident) across the Chief Architect's own required cycle: Mission
 * Control -> Ship Detail -> Loadout Manager -> Ship Detail -> Loadout
 * Manager -> Ship Detail, asserting at every hop that hierarchy, Existing
 * Loadouts, and Fleet Asset context all survive without a refresh.
 *
 * Ship Detail has no direct link back to Loadout Manager for a ship whose
 * active build is already a custom Loadout (only the Factory-Only banner
 * offers one) — this test uses the Sidebar's own always-available
 * "Loadout Manager" link (no ?shipId=) plus the Ship dropdown, exactly
 * like a real Commander without that direct link would have to. See the
 * EWO-026 report for this disclosed, out-of-scope UI gap.
 */
function openLoadoutManagerFor(shipId: string) {
  fireEvent.click(screen.getByText('Loadout Manager'))
  const shipSelect = screen.getAllByRole('combobox').find((el) => el.tagName === 'SELECT' && (el as HTMLSelectElement).value !== shipId) as HTMLSelectElement | undefined
  if (shipSelect) fireEvent.change(shipSelect, { target: { value: shipId } })
}

describe('EWO-026 (round 2, Task 4): full navigation flow preserves state without a refresh', () => {
  it('Mission Control -> Ship Detail -> Loadout Manager -> Create+Save -> Ship Detail (hierarchy intact) -> Loadout Manager (Existing Loadouts intact) -> Edit+Save -> Ship Detail', () => {
    const result = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Nav Flow Cutty')
    const shipId = result.assetId!

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )

    // Mission Control -> Ship Detail (real full-card Link).
    const cardLink = document.querySelector(`a[href="/ship/${shipId}"]`) as HTMLAnchorElement
    expect(cardLink).toBeTruthy()
    fireEvent.click(cardLink)
    expect(screen.getAllByText('Nav Flow Cutty').length).toBeGreaterThan(0)

    // Ship Detail -> Loadout Manager (Sidebar link, then select this ship).
    openLoadoutManagerFor(shipId)
    fireEvent.change(screen.getByPlaceholderText(/Deep Salvage Run/i), { target: { value: 'Flow Build A' } })
    fireEvent.click(screen.getByText(/Create & Set as Active Loadout/i))
    // Stays in Loadout Manager (no navigation) — Task 1 (round 1) behavior.
    expect(screen.getAllByText('Loadout Manager').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Flow Build A').length).toBeGreaterThan(0)

    // Explicit navigation to Ship Detail for the exact same Fleet Asset.
    fireEvent.click(screen.getByText('View in Ship Detail'))
    expect(screen.getAllByText('Nav Flow Cutty').length).toBeGreaterThan(0)
    // Category hierarchy is intact — the round-2 Task 1 fix.
    expect(screen.getByText('Weapons')).toBeInTheDocument()
    expect(screen.getByText('Core Systems')).toBeInTheDocument()
    expect(screen.getByText('Manned Turrets')).toBeInTheDocument()

    // Ship Detail -> Loadout Manager again — Existing Loadouts must still list Flow Build A.
    openLoadoutManagerFor(shipId)
    expect(screen.getByText('Existing Loadouts')).toBeInTheDocument()
    expect(screen.getAllByText('Flow Build A').length).toBeGreaterThan(0)

    // Edit it and Save Changes — still in Loadout Manager afterward, Build count unchanged.
    const buildCountBeforeEdit = useFleetStore.getState().builds.length
    fireEvent.click(screen.getByText('Edit an Existing Loadout'))
    fireEvent.click(screen.getByText('Save Changes'))
    expect(screen.getAllByText('Loadout Manager').length).toBeGreaterThan(0)
    expect(useFleetStore.getState().builds.length).toBe(buildCountBeforeEdit)
    expect(screen.getAllByText('Flow Build A').length).toBeGreaterThan(0)

    // Back to Ship Detail one more time — hierarchy still intact, nothing lost.
    fireEvent.click(screen.getByText('View in Ship Detail'))
    expect(screen.getByText('Weapons')).toBeInTheDocument()
    expect(screen.getByText('Core Systems')).toBeInTheDocument()
  })

  it('Save As New during the same navigation cycle produces a distinct Build that survives a further Ship Detail round-trip', () => {
    const result = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Nav Flow Clone Ship')
    const shipId = result.assetId!

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    openLoadoutManagerFor(shipId)
    fireEvent.change(screen.getByPlaceholderText(/Deep Salvage Run/i), { target: { value: 'Original Flow Build' } })
    fireEvent.click(screen.getByText('Create Loadout'))
    const original = useFleetStore.getState().builds.find((b) => b.name === 'Original Flow Build')!

    fireEvent.click(screen.getByText('Save as New Loadout'))
    const clone = useFleetStore.getState().builds.find((b) => b.name === 'Original Flow Build (Copy)')!
    expect(clone).toBeDefined()
    expect(clone.id).not.toBe(original.id)

    fireEvent.click(screen.getByText('View in Ship Detail'))
    expect(document.body.textContent).not.toMatch(/undefined|NaN/)

    openLoadoutManagerFor(shipId)
    expect(screen.getAllByText('Original Flow Build').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Original Flow Build (Copy)').length).toBeGreaterThan(0)
  })
})
