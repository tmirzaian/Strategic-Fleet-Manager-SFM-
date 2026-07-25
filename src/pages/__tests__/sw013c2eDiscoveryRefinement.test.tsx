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

function renderShipWorkspace(shipDefinitionId: string) {
  const result = useFleetStore.getState().addFleetAsset(shipDefinitionId, 'OWNED')
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
}

function optionsFor(ariaLabel: string): string[] {
  const input = screen.getByLabelText(ariaLabel) as HTMLInputElement
  fireEvent.click(input)
  const listboxId = input.getAttribute('aria-controls')
  return Array.from(document.querySelectorAll(`#${listboxId} li`)).map((li) => li.textContent ?? '')
}

/**
 * SW-013C.2E (Objective 2): EMP Compatibility Refinement. Live data
 * confirmed REP-VS (`AEGS_EMP_Sentinel_S4`) is genuinely compatible — a
 * tight, 2-member confirmed swap group, and the entity is factory-shipped
 * on a real ship (Aegis Vanguard Sentinel) elsewhere in the game. The
 * real issue was display formatting: the swap-group option branch used
 * its own ad hoc "{name} — S{size}" label instead of the canonical
 * "{name} — {category}, S{size}" convention `fullComponentCatalog.ts`
 * already established for a genuinely ambiguous name.
 */
describe('SW-013C.2E (Objective 2): Warlock EMP compatibility and canonical presentation', () => {
  it('both REP-8 (factory) and REP-VS (confirmed swap-group alternate) are offered, following canonical "{name} — {category}, S{size}" formatting', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('avenger-warlock-imported')
    const options = optionsFor('New target for Emp Weapon')
    const joined = options.join(' | ')
    expect(joined).toContain('REP-8 EMP Generator')
    expect(joined).toContain('REP-VS EMP Generator — EMP, S4')
  })
})

/**
 * SW-013C.2E (Objective 3/4/6): Retaliator Module Family Discovery.
 * Confirmed live (category A-confirmed swap groups): Front/Rear each have
 * 4 real members (Base/"Unladen", Cargo, Bomber/"Ordnance", and a bare
 * "Unladen" duplicate whose own DataCore record has no resolvable display
 * name — correctly excluded from presentation per Objective 6's "no
 * misleading duplicates" rule, since the factory default already IS the
 * real, named Unladen option).
 */
describe('SW-013C.2E (Objective 3/4/6): Retaliator Front/Rear module family discovery', () => {
  // SW-013C.2F (Objective 4) — the redundant "Retaliator " prefix these
  // assertions originally checked for is now deliberately stripped from
  // the DISPLAYED label (never from the committed value — see
  // sw013c2fCommanderUxClosure.test.tsx's own dedicated coverage of
  // that). Updated here to match the intentional, later-mission label
  // cleanup rather than re-asserting the now-superseded format.
  it('Front Module offers real Cargo and Ordnance alternatives with canonical labels, and no unnamed duplicate Unladen entry', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('retaliator-imported')
    const options = optionsFor('New target for Front Module')
    const joined = options.join(' | ')
    expect(joined).toContain('Unladen Front Module') // factory default, pinned
    expect(joined).toContain('Cargo Front Module — Module, S3')
    expect(joined).toContain('Ordnance Front Module — Module, S3')
    // No second, nameless "Unladen" duplicate.
    expect(options.filter((o) => o.includes('Unladen')).length).toBe(1)
  })

  it('Rear Module offers its own real Cargo and Ordnance alternatives independently of Front', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('retaliator-imported')
    const options = optionsFor('New target for Rear Module')
    const joined = options.join(' | ')
    expect(joined).toContain('Unladen Rear Module')
    expect(joined).toContain('Cargo Rear Module — Module, S3')
    expect(joined).toContain('Ordnance Rear Module — Module, S3')
    expect(options.filter((o) => o.includes('Unladen')).length).toBe(1)
  })

  it('selecting the Cargo module actually commits and persists — real store write, not a preview-only artifact', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('retaliator-imported')
    const input = screen.getByLabelText('New target for Front Module') as HTMLInputElement
    fireEvent.click(input)
    fireEvent.change(input, { target: { value: 'Cargo Front' } })
    const listboxId = input.getAttribute('aria-controls')
    const option = document.querySelector(`#${listboxId} li button`) as HTMLButtonElement
    fireEvent.click(option)
    fireEvent.click(screen.getAllByText('Save Changes')[0])

    const ship = useFleetStore.getState().ships.find((s) => s.id.startsWith('retaliator-imported-asset-'))!
    const row = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === 'Front Module')
    expect(row?.targetItem).toBe('Retaliator Cargo Front Module')
    expect(row?.targetEntityClass).toBe('AEGS_Retaliator_Module_Front_Cargo')
  })
})
