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
  return result
}

function optionsFor(ariaLabel: string): string[] {
  const input = screen.getByLabelText(ariaLabel) as HTMLInputElement
  fireEvent.click(input)
  const listboxId = input.getAttribute('aria-controls')
  return Array.from(document.querySelectorAll(`#${listboxId} li`)).map((li) => li.textContent ?? '')
}

/**
 * SW-013C.2F (Objective 1): Hornet Mk II Nose Turret Presentation. The
 * real, confirmed swap group (`ANVL_Hornet_Mk2`) exists on
 * `hardpoint_weapon_nose` — a REAL, factory-OCCUPIED port on the F7CM
 * Mk2/F7A Mk2 (never on the Ghost, whose own copy of this hardpoint ships
 * factory-empty — see hornetNoseTurretDiscovery.test.ts, unchanged by
 * this mission). Root cause of "Commander cannot select it" on ships that
 * DO have the port: (a) the confirmed alternate entity
 * (`ANVL_Hornet_F7C_Mk2_Nose_Turret`) was missing from the runtime
 * catalog, and (b) the generic sweep matched a dozen unrelated real
 * ships' own turrets by size alone (DataCore's "Turret" category
 * translates generically to "Gimbal Mount," matching this port's own
 * type). Both fixed generically (a supplementary catalog entry, and
 * extending the existing swap-group-only gating to Gimbal Mount ports
 * with a confirmed group) — never Hornet-specific code.
 */
describe('SW-013C.2F (Objective 1): Hornet F7CM Mk2 Nose Weapon Mount is now correctly scoped to its real confirmed alternates', () => {
  it('offers exactly the 2 real, confirmed swap-group members — no unrelated cross-ship turret noise', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('hornet-f7cm-mk2-imported')
    const options = optionsFor('New target for Nose Weapon Mount')
    const joined = options.join(' | ')
    expect(joined).toContain('Nose Turret — Gimbal Mount, S3')
    // None of the confirmed-unrelated real ships' own turrets appear.
    for (const unrelated of ['Anvil Arrow', 'Lightning F8C', 'Terrapin', 'Mustang', 'Origin Jumpworks 85X', 'Tumbril Storm']) {
      expect(joined).not.toContain(unrelated)
    }
    expect(options).toHaveLength(3) // Intentional Empty + 2 real confirmed members
  })
})

/**
 * SW-013C.2F (Objective 2/6): Warlock EMP Presentation. REP-VS remains
 * genuinely, authoritatively compatible (SW-013C.2E's own finding stands)
 * — the fix is that BOTH REP-8 and REP-VS now render with IDENTICAL
 * canonical formatting, so a Commander sees two clearly parallel, real,
 * comparable options rather than one canonically-labeled entry and one
 * bare, unlabeled "Factory Device"-style entry.
 */
describe('SW-013C.2F (Objective 2/6): Warlock EMP entries present with consistent canonical formatting', () => {
  it('REP-8 (factory) and REP-VS (swap-group alternate) both show "— EMP, S4" — no ambiguous bare duplicate', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('avenger-warlock-imported')
    const options = optionsFor('New target for Emp Weapon')
    expect(options).toContain('Intentional Empty (—)')
    expect(options.some((o) => o.startsWith('REP-8 EMP Generator — EMP, S4'))).toBe(true)
    expect(options.some((o) => o.startsWith('REP-VS EMP Generator — EMP, S4'))).toBe(true)
    // No bare, unlabeled duplicate of either name.
    expect(options).not.toContain('REP-8 EMP Generator')
    expect(options).not.toContain('REP-VS EMP Generator')
  })
})

/**
 * SW-013C.2F (Objective 3): Retaliator Commander Messaging. Selecting an
 * Ordnance module surfaces an honest, non-fabricated "Additional Topology
 * Pending" notice — never a speculative child port, never implying
 * failure (the module selection itself is fully saved and correct).
 */
describe('SW-013C.2F (Objective 3): Retaliator dormant-topology Commander messaging', () => {
  it('the badge is absent for the factory default (Unladen) and for Cargo', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('retaliator-imported')
    expect(screen.queryByText('Additional Topology Pending')).not.toBeInTheDocument()
  })

  it('the badge appears once an Ordnance module is selected and saved, and never fabricates a child row', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('retaliator-imported')
    const input = screen.getByLabelText('New target for Front Module') as HTMLInputElement
    fireEvent.click(input)
    fireEvent.change(input, { target: { value: 'Ordnance' } })
    const listboxId = input.getAttribute('aria-controls')
    fireEvent.click(document.querySelector(`#${listboxId} li button`) as HTMLButtonElement)
    fireEvent.click(screen.getAllByText('Save Changes')[0])
    fireEvent.click(screen.getAllByText(/Manage Loadout/)[0])
    for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)

    expect(screen.getAllByText('Additional Topology Pending').length).toBeGreaterThan(0)
    // No speculative child port materialized under Front Module.
    expect(screen.queryByText(/hardpoint_torpedo_launcher/)).not.toBeInTheDocument()
    expect(screen.queryByText('Torpedo Rack')).not.toBeInTheDocument()
  })
})

/**
 * SW-013C.2F (Objective 4): Commander Label Cleanup, Phase 1. The
 * redundant "Retaliator " prefix (already established by the "Ship:
 * Retaliator" context shown at the top of the page) is dropped from
 * swap-group option labels — the underlying committed value is
 * unaffected. Front/Rear are deliberately preserved (removing them would
 * make the two ports' options read identically, the opposite of clarity).
 */
describe('SW-013C.2F (Objective 4): Retaliator module labels drop the redundant ship-name prefix', () => {
  it('Front Module options read "Cargo Front Module"/"Ordnance Front Module", never "Retaliator ..."', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('retaliator-imported')
    const options = optionsFor('New target for Front Module')
    const joined = options.join(' | ')
    expect(joined).toContain('Cargo Front Module — Module, S3')
    expect(joined).toContain('Ordnance Front Module — Module, S3')
    expect(joined).not.toContain('Retaliator')
  })

  it('the actually-committed value remains the full, real catalog display name — labels are cosmetic only', () => {
    if (catalogComponentsByName.size === 0) return
    const result = renderShipWorkspace('retaliator-imported')
    const input = screen.getByLabelText('New target for Front Module') as HTMLInputElement
    fireEvent.click(input)
    fireEvent.change(input, { target: { value: 'Cargo' } })
    const listboxId = input.getAttribute('aria-controls')
    fireEvent.click(document.querySelector(`#${listboxId} li button`) as HTMLButtonElement)
    fireEvent.click(screen.getAllByText('Save Changes')[0])

    const ship = useFleetStore.getState().ships.find((s) => s.id === result.assetId)!
    const row = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === 'Front Module')
    expect(row?.targetItem).toBe('Retaliator Cargo Front Module')
    expect(row?.targetEntityClass).toBe('AEGS_Retaliator_Module_Front_Cargo')
  })
})
