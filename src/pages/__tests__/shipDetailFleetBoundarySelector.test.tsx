import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipDetail from '../ShipDetail'
import { useFleetStore } from '../../store/useFleetStore'
import { importedShipList } from '../../generated/importedShips'

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

/** The "Select Ship" combobox is always the first combobox rendered — the
 * only other one ("Active Loadout") only exists on the normal (non-preview)
 * branch and always renders after it in document order. */
function selectShipOptionValues(): string[] {
  const combobox = screen.getAllByRole('combobox')[0]
  return within(combobox)
    .getAllByRole('option')
    .map((o) => (o as HTMLOptionElement).value)
}

/**
 * EWO-033A-V1 (Task 7) — reproduces the Commander-observed defect: Ship
 * Detail's "Select Ship" dropdown lists every entry from
 * `src/generated/importedShips.ts` (the offline deep-import pipeline's
 * output) unconditionally, in addition to the live Commander fleet
 * (`useFleetStore`'s `ships` array) — regardless of whether a corresponding
 * Fleet Asset was ever added. Fleet Dashboard and Mission Control read only
 * `ships`/`fleetAssets` and never reference `importedShipList` at all, which
 * is why only Ship Detail shows the extra "(Imported)" options.
 *
 * These tests are written to FAIL against the current defect (root cause F —
 * dev-preview leakage, `src/pages/ShipDetail.tsx`'s `selectShip` control
 * unconditionally appending `importedShipList.map(...)`). No production code
 * is changed by this investigation mission.
 */
describe('<ShipDetail /> — EWO-033A-V1 (Task 7): fleet-boundary selector regression', () => {
  it('the Select Ship dropdown must not list any deep-import preview ship that has no corresponding Fleet Asset', () => {
    renderShipDetail('ghost')
    const values = selectShipOptionValues()
    const liveShipIds = new Set(useFleetStore.getState().ships.map((s) => s.id))
    for (const view of importedShipList) {
      if (!liveShipIds.has(view.ship.id)) {
        expect(values).not.toContain(view.ship.id)
      }
    }
  })

  it('the Select Ship dropdown must contain exactly the live fleet\'s own ship ids — no more, no fewer', () => {
    renderShipDetail('ghost')
    const values = selectShipOptionValues()
    const liveShipIds = useFleetStore.getState().ships.map((s) => s.id).sort()
    // FTB-001A (Workstream D) — the dropdown now also carries a real blank
    // placeholder option ("Select a ship…", value "") so a Commander can
    // explicitly return to the unselected state; it is not itself a ship
    // and is deliberately excluded from this "exactly the live fleet"
    // check.
    expect(values.filter((v) => v !== '').sort()).toEqual(liveShipIds)
  })

  it('a removed Fleet Asset disappears from the selector immediately', () => {
    const added = useFleetStore.getState().addFleetAsset('eclipse-imported', 'OWNED')
    expect(added.success).toBe(true)
    renderShipDetail('ghost')
    expect(selectShipOptionValues()).toContain(added.assetId)
    cleanup()

    useFleetStore.getState().removeFleetAsset(added.assetId!)
    renderShipDetail('ghost')
    expect(selectShipOptionValues()).not.toContain(added.assetId)
  })

  it('catalog-only definitions without a Fleet Asset never appear in the selector', () => {
    renderShipDetail('ghost')
    const values = selectShipOptionValues()
    // AEGS_Hammerhead is a Mission M-012 catalog-only hull never added to
    // the seed/test fleet — a representative "never owned" case.
    expect(values).not.toContain('AEGS_Hammerhead')
  })

  it('duplicate owned copies of the same hull remain separately selectable', () => {
    const a = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Cutty One')
    const b = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Cutty Two')
    expect(a.success).toBe(true)
    expect(b.success).toBe(true)
    renderShipDetail('ghost')
    const values = selectShipOptionValues()
    expect(values).toContain(a.assetId)
    expect(values).toContain(b.assetId)
  })
})
