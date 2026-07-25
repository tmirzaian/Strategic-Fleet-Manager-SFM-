import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
  // @ts-expect-error — test-only global stub, not a real IntersectionObserver
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => cleanup())

function renderEclipseWorkspace() {
  const result = useFleetStore.getState().addFleetAsset('eclipse-imported', 'OWNED')
  render(
    <MemoryRouter initialEntries={[`/ship-workspace/${result.assetId}`]}>
      <Routes>
        <Route path="/ship-workspace/:shipId" element={<ShipWorkspacePrototype />} />
      </Routes>
    </MemoryRouter>
  )
  for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)
  fireEvent.click(screen.getByText(/Manage Loadout/))
  for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)
  return result
}

function selectFirstOption(ariaLabel: string, query: string) {
  const input = screen.getByLabelText(ariaLabel) as HTMLInputElement
  fireEvent.click(input)
  fireEvent.change(input, { target: { value: query } })
  const listbox = document.getElementById(input.getAttribute('aria-controls')!) as HTMLElement
  fireEvent.click(listbox.querySelector('button') as HTMLButtonElement)
}

/**
 * SW-013C.2F Amendment A (Finding 1) — Eclipse Bomb Rack Save Failure.
 *
 * Root cause: `withMissileRackAggregation`/`makeMissileAggregateRow`
 * synthesizes one summarized aggregate row per rack, with a SYNTHETIC
 * `slotLabel` (e.g. "Torpedorack — Bomb") that has no real corresponding
 * Hardpoint. `MissionComposer.tsx` already fans a Commander's single
 * aggregate-row selection out to every real per-child slotLabel
 * (`childSlotLabels`, EWO-054) before writing it to its own `overrides`
 * state — `ShipWorkspacePrototype.tsx`'s own `commitNewTarget` never
 * received the equivalent fix when its aggregate-row rendering was built,
 * so it wrote the Commander's bomb selection directly to the SYNTHETIC
 * `hp.slotLabel`, producing a `targetOverrides` entry
 * `saveMissionConfiguration` could never resolve — the exact
 * "Could not save — 1 assignment(s) referenced a port that no longer
 * exists on this ship: Torpedorack — Bomb" error reported. Fixed by
 * replicating MissionComposer's own fan-out pattern in
 * `commitNewTarget` — see ShipWorkspacePrototype.tsx.
 *
 * Required test matrix (verbatim from the Amendment): 1x S10 rack saves
 * and reloads; 4x S5 rack saves and reloads; 20x S3 rack saves and
 * reloads; correct child count and size for each; factory torpedo rack
 * remains valid (see sw013c2dEclipseCompatibility.test.tsx); Retaliator
 * racks remain excluded (see sw013c2dEclipseCompatibility.test.tsx).
 */
describe('SW-013C.2F Amendment A (Finding 1): Eclipse alternate bomb rack save/reload', () => {
  const cases: { rackQuery: string; rackItem: string; rackEntityClass: string; bombQuery: string; bombItem: string; bombEntityClass: string; childCount: number; childSize: string }[] = [
    {
      rackQuery: '1xS10',
      rackItem: 'Aegis Eclipse 1xS10 Bomb Rack',
      rackEntityClass: 'BMBRCK_S10_AEGS_Eclipse',
      bombQuery: 'Colossus',
      bombItem: 'Colossus Bomb',
      bombEntityClass: 'BOMB_S10_FSKI_Colossus',
      childCount: 1,
      childSize: 'S10',
    },
    {
      rackQuery: '4xS5',
      rackItem: 'Aegis Eclipse 4xS5 Bomb Rack',
      rackEntityClass: 'BMBRCK_S05_AEGS_Eclipse',
      bombQuery: 'Stormburst',
      bombItem: 'Stormburst Bomb',
      bombEntityClass: 'BOMB_S05_FSKI',
      childCount: 4,
      childSize: 'S5',
    },
    {
      rackQuery: '20xS3',
      rackItem: 'Aegis Eclipse 20xS3 Bomb Rack',
      rackEntityClass: 'BMBRCK_S03_AEGS_Eclipse',
      bombQuery: 'Thunderball',
      bombItem: 'Thunderball Bomb',
      bombEntityClass: 'BOMB_S03_FSKI_Thunderball',
      childCount: 20,
      childSize: 'S3',
    },
  ]

  for (const c of cases) {
    it(`${c.rackItem}: select rack, assign ${c.bombItem} to every slot, save via the real UI, and survive a genuine store reload with correct parent + all ${c.childCount} child payload(s)`, async () => {
      if (catalogComponentsByName.size === 0) return
      const added = renderEclipseWorkspace()

      selectFirstOption('New target for Torpedorack', c.rackQuery)
      selectFirstOption('New target for Bomb', c.bombQuery)

      fireEvent.click(screen.getAllByText('Save Changes')[0])

      // The exact failure mode this Finding reports: a "Could not save"
      // banner naming a synthetic port that "no longer exists on this
      // ship". Must never appear.
      expect(screen.queryByText(/Could not save/)).not.toBeInTheDocument()
      expect(screen.getByText(/saved/i)).toBeInTheDocument()

      const build = useFleetStore.getState().builds.find((b) => b.shipId === added.assetId)!
      const hardpointsBeforeReload = useFleetStore.getState().hardpoints.filter((h) => h.buildId === build.id)
      const rackBefore = hardpointsBeforeReload.find((h) => h.slotLabel === 'Torpedorack')!
      expect(rackBefore.targetItem).toBe(c.rackItem)
      expect(rackBefore.targetEntityClass).toBe(c.rackEntityClass)

      const childrenBefore = hardpointsBeforeReload.filter((h) => h.parentSlotLabel === 'Torpedorack')
      expect(childrenBefore).toHaveLength(c.childCount)
      for (const child of childrenBefore) {
        expect(child.size).toBe(c.childSize)
        expect(child.targetItem).toBe(c.bombItem)
        expect(child.targetEntityClass).toBe(c.bombEntityClass)
      }

      // Genuine reload — vi.resetModules() before re-import, not a
      // same-module re-import, so real rehydration/reconciliation runs
      // (established pattern across this codebase's own store tests).
      vi.resetModules()
      const { useFleetStore: reloaded } = await import('../../store/useFleetStore')
      const hardpointsAfterReload = reloaded.getState().hardpoints.filter((h) => h.buildId === build.id)
      const rackAfter = hardpointsAfterReload.find((h) => h.slotLabel === 'Torpedorack')!
      expect(rackAfter.targetItem).toBe(c.rackItem)
      expect(rackAfter.targetEntityClass).toBe(c.rackEntityClass)

      const childrenAfter = hardpointsAfterReload.filter((h) => h.parentSlotLabel === 'Torpedorack')
      expect(childrenAfter).toHaveLength(c.childCount)
      for (const child of childrenAfter) {
        expect(child.size).toBe(c.childSize)
        expect(child.targetItem).toBe(c.bombItem)
        expect(child.targetEntityClass).toBe(c.bombEntityClass)
      }
    })
  }
})
