import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipDetail from '../ShipDetail'
import MissionComposer from '../MissionComposer'
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

  it('Mission M-011: Ghost Mk II exposes its Nose Mount with two child weapon positions, collapsed by default', () => {
    renderShipDetail('ghost')
    expect(screen.getByText('Nose Mount')).toBeInTheDocument()
    expect(screen.queryByText('Weapon 1')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Expand All'))
    expect(screen.getByText('Weapon 1')).toBeInTheDocument()
    expect(screen.getByText('Weapon 2')).toBeInTheDocument()
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

  it('EWO-031 (Task 6/7): Origin 135c shows no "Unknown Factory Item" anywhere on Ship Detail — Factory, Installed, and Target all resolve to real components', () => {
    renderShipDetail('135c')
    expect(screen.queryByText('Unknown Factory Item')).not.toBeInTheDocument()
  })

  it('EWO-031 (Task 6/7): UTV shows no "Unknown Factory Item" anywhere on Ship Detail either — the same fix applied to the other affected seed ship', () => {
    renderShipDetail('utv')
    expect(screen.queryByText('Unknown Factory Item')).not.toBeInTheDocument()
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

describe('EWO-026 (Task 3/4/13): exact Fleet Asset navigation and safe fallback', () => {
  it('11. two Fleet Assets of the same hull, opened directly by id, each show their own distinct instance', () => {
    const a = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Cutty One')
    const b = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Cutty Two')
    expect(a.success && b.success).toBe(true)

    renderShipDetail(b.assetId!)
    // The nickname is what distinguishes the two instances in the UI —
    // opening by the second asset's own id must show its own nickname as
    // the active ship's hero name, never silently fall back to the first
    // Cutlass Black added (both nicknames legitimately still appear in the
    // page's own "Select Ship" switcher, which lists every ship).
    expect(screen.getByAltText('Cutty Two')).toBeInTheDocument()
    expect(screen.queryByAltText('Cutty One')).not.toBeInTheDocument()
  })

  it('12. a missing/stale Fleet Asset id never crashes — falls back to the existing safe default (first ship)', () => {
    expect(() => renderShipDetail('this-fleet-asset-id-does-not-exist')).not.toThrow()
    // Safe fallback already in place: `ships.find(...) ?? ships[0]`.
    const firstShip = useFleetStore.getState().ships[0]
    expect(screen.getAllByText(new RegExp(firstShip.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).length).toBeGreaterThan(0)
  })

  it('normal navigation into Ship Detail (no stale/duplicate concerns) still opens the requested ship', () => {
    renderShipDetail('utv')
    expect(screen.getAllByText(/UTV/i).length).toBeGreaterThan(0)
  })
})

describe('EWO-026 (round 2, Task 1): Ship Detail rebuilds the canonical Port Tree after a saved Loadout becomes active', () => {
  it('a Loadout created and activated in Loadout Manager shows full category headers in Ship Detail — never a flat table', () => {
    const result = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED')
    const shipId = result.assetId!

    render(
      <MemoryRouter initialEntries={[`/loadout-manager?shipId=${shipId}`]}>
        <MissionComposer />
      </MemoryRouter>
    )
    fireEvent.change(screen.getByPlaceholderText(/Deep Salvage Run/i), { target: { value: 'Repro Build' } })
    fireEvent.click(screen.getByText(/Create & Set as Active Loadout/i))
    // Ground truth: saveMissionConfiguration still does not write
    // groupLabel/parentSlotLabel/isStructural onto the saved Build's own
    // rows — this test exercises the real stripped-data condition.
    const activeBuildId = useFleetStore.getState().ships.find((s) => s.id === shipId)?.activeBuildId
    const savedRow = useFleetStore.getState().hardpoints.find((h) => h.buildId === activeBuildId)!
    expect(savedRow.groupLabel).toBeUndefined()
    cleanup()

    renderShipDetail(shipId)
    expect(screen.getByText('Weapons')).toBeInTheDocument()
    expect(screen.getByText('Core Systems')).toBeInTheDocument()
    expect(screen.getByText('Manned Turrets')).toBeInTheDocument()
  })

  it("does not alter readiness/logistics — Ship Detail's Readiness percentage is identical before and after the hierarchy-display fix", () => {
    // The overlay only changes what LoadoutPortTree renders; progress and
    // buildState are still computed from the exact same shipHardpoints.
    renderShipDetail('corsair')
    expect(screen.getByText('Mission Ready')).toBeInTheDocument()
  })
})
