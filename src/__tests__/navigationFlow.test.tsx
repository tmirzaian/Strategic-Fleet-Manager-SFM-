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
 * `App` router end to end with real clicks across the Chief Architect's
 * own required cycle: Mission Control -> Ship Management -> Loadout
 * Manager -> Ship Management -> Loadout Manager -> Ship Management,
 * asserting at every hop that hierarchy, Existing Loadouts, and Fleet
 * Asset context all survive.
 *
 * EWO-062A (Part B) retired the Sidebar's "Loadout Manager" link from
 * normal Commander navigation entirely (this test originally relied on
 * exactly that link, per its own prior doc comment — see git history).
 * The route itself is explicitly preserved for direct/deep-link access
 * ("Where an old route is reached directly, Engineering should preserve
 * current behavior" — EWO-062A), so this now simulates exactly that: a
 * fresh visit to the URL directly, the only way a Commander can still
 * reach this page. Store state (Zustand) lives at module scope, not in
 * the React tree, so a `cleanup()` + fresh `render()` here does NOT reset
 * it — this still genuinely proves Existing Loadouts/hierarchy/Fleet
 * Asset context persist across the hop (arguably more meaningfully than
 * before: it proves the data was actually saved to the store, not merely
 * carried over in memory by an un-remounted component tree). The one hop
 * that still exercises true in-tree client-side routing is Loadout
 * Manager's own "View in Ship Management" link, which is unaffected by
 * this mission and still clicked directly below.
 */
function openLoadoutManagerFor(shipId: string) {
  cleanup()
  render(
    <MemoryRouter initialEntries={[`/loadout-manager?shipId=${shipId}`]}>
      <App />
    </MemoryRouter>
  )
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

    // Mission Control -> Ship Workspace (real full-card Link, SW-013B Objective 1).
    const cardLink = document.querySelector(`a[href="/ship-workspace/${shipId}"]`) as HTMLAnchorElement
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
    fireEvent.click(screen.getByText('View in Ship Management'))
    expect(screen.getAllByText('Nav Flow Cutty').length).toBeGreaterThan(0)
    // Category hierarchy is intact — the round-2 Task 1 fix.
    expect(screen.getByText('Pilot Weapons')).toBeInTheDocument()
    expect(screen.getByText('Core Components')).toBeInTheDocument()
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
    fireEvent.click(screen.getByText('View in Ship Management'))
    expect(screen.getByText('Pilot Weapons')).toBeInTheDocument()
    expect(screen.getByText('Core Components')).toBeInTheDocument()
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

    fireEvent.click(screen.getByText('View in Ship Management'))
    expect(document.body.textContent).not.toMatch(/undefined|NaN/)

    openLoadoutManagerFor(shipId)
    expect(screen.getAllByText('Original Flow Build').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Original Flow Build (Copy)').length).toBeGreaterThan(0)
  })
})
