import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'
import { buildProcurementList } from '../../utils/procurement'

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

function renderWorkspace(shipId?: string) {
  return render(
    <MemoryRouter initialEntries={[shipId ? `/ship-workspace/${shipId}` : '/ship-workspace']}>
      <Routes>
        <Route path="/ship-workspace" element={<ShipWorkspacePrototype />} />
        <Route path="/ship-workspace/:shipId" element={<ShipWorkspacePrototype />} />
      </Routes>
    </MemoryRouter>
  )
}

function selectFirstOption(ariaLabel: string, query: string) {
  const input = screen.getByLabelText(ariaLabel) as HTMLInputElement
  fireEvent.click(input)
  fireEvent.change(input, { target: { value: query } })
  const listbox = document.getElementById(input.getAttribute('aria-controls')!) as HTMLElement
  fireEvent.click(listbox.querySelector('button') as HTMLButtonElement)
}

/** The aggregate payload row always renders as its own `<tr>` immediately
 * following its parent rack's own row (SW-007D) — scope to it by rack
 * slotLabel rather than `getByLabelText('New target for Missile'/'Bomb')`,
 * which collides whenever a ship has more than one rack. */
function aggregateRowInputFor(rackSlotLabel: string): HTMLInputElement {
  const matches = screen.getAllByText(rackSlotLabel)
  const rackRowLabel = matches.find((el) => el.closest('tr') !== null)
  const rackRow = rackRowLabel!.closest('tr') as HTMLElement
  const aggregateRow = rackRow.nextElementSibling as HTMLElement
  return within(aggregateRow).getByRole('combobox') as HTMLInputElement
}

function pendingChangeCount(): number {
  const banner = screen.getByTestId('ship-operational-banner')
  const text = within(banner).queryByText(/Pending Change/)?.textContent ?? ''
  const match = /Pending Changes? \((\d+)\)/.exec(text)
  return match ? Number(match[1]) : 0
}

/**
 * SW-013C.2F Amendment B — Dynamic Payload Selection Functional Recovery.
 *
 * Root cause: Amendment A's `commitNewTarget` correctly fans a Commander's
 * aggregate-row pick out to every real child slotLabel on WRITE — but the
 * READ side that computes what the picker currently displays
 * (`ShipWorkspacePrototype.tsx`'s `renderLensCells`, the `desired` local)
 * still looked up `desiredTargets[hp.slotLabel]` — the aggregate row's own
 * SYNTHETIC slotLabel, which the write side deliberately never populates.
 * That lookup was therefore always `undefined`, silently falling through
 * to `hp.targetItem` — which, for a just-swapped rack whose children are
 * freshly synthesized and not yet saved, is itself the empty sentinel
 * ("—") — reproducing exactly the reported "selection appears to revert"
 * defect. Fixed by resolving the pending value from the aggregate row's
 * own real child slotLabels (`hp.missileAggregate.childSlotLabels`) —
 * `commitNewTarget`'s fan-out always writes the identical value to every
 * child in one state update, so any one child's pending entry represents
 * the whole rack. `hp.targetItem` itself is left untouched, preserving
 * `isEdited`'s existing "pending vs. last-saved" comparison semantics.
 */
describe('SW-013C.2F Amendment B: dynamic payload selection is retained immediately, not just at save', () => {
  it('MSD-313 (1x S3 missile child): selecting Thunderbolt III remains visible immediately, pending count updates, save succeeds, genuine reload preserves it', async () => {
    if (catalogComponentsByName.size === 0) return
    const added = renderShipWorkspace('avenger-warlock-imported')

    selectFirstOption('New target for Left Missile Rack', 'MSD-313')
    const missileInput = aggregateRowInputFor('Left Missile Rack')
    fireEvent.click(missileInput)
    fireEvent.change(missileInput, { target: { value: 'Thunderbolt III' } })
    const listbox = document.getElementById(missileInput.getAttribute('aria-controls')!) as HTMLElement
    fireEvent.click(listbox.querySelector('button') as HTMLButtonElement)

    // Target remains visible immediately — the exact defect this Amendment reports.
    expect(missileInput.value).toBe('Thunderbolt III Missile')
    // Pending count updates (non-zero) immediately, before any save.
    expect(pendingChangeCount()).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByText('Save Changes')[0])
    expect(screen.queryByText(/Could not save/)).not.toBeInTheDocument()

    const build = useFleetStore.getState().builds.find((b) => b.shipId === added.assetId)!
    const hardpoints = useFleetStore.getState().hardpoints.filter((h) => h.buildId === build.id)
    const rack = hardpoints.find((h) => h.slotLabel === 'Left Wing Weapon Missile Rack')!
    expect(rack.targetEntityClass).toBe('MRCK_S03_BEHR_Single_S03')
    const children = hardpoints.filter((h) => h.parentSlotLabel === 'Left Wing Weapon Missile Rack')
    expect(children).toHaveLength(1)
    expect(children[0].size).toBe('S3')
    expect(children[0].targetItem).toBe('Thunderbolt III Missile')

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../../store/useFleetStore')
    const reloadedHardpoints = reloaded.getState().hardpoints.filter((h) => h.buildId === build.id)
    const reloadedChildren = reloadedHardpoints.filter((h) => h.parentSlotLabel === 'Left Wing Weapon Missile Rack')
    expect(reloadedChildren).toHaveLength(1)
    expect(reloadedChildren[0].targetItem).toBe('Thunderbolt III Missile')
  })

  it('existing multi-child missile rack (Hornet Ghost factory MSD-341, 4x S1): selecting a new missile remains visible immediately, no regression', () => {
    if (catalogComponentsByName.size === 0) return
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    fireEvent.click(screen.getByText('Missile Racks'))

    const missileInput = aggregateRowInputFor('Right Missile Rack')
    fireEvent.click(missileInput)
    fireEvent.change(missileInput, { target: { value: 'Spark I' } })
    const listbox = document.getElementById(missileInput.getAttribute('aria-controls')!) as HTMLElement
    fireEvent.click(listbox.querySelector('button') as HTMLButtonElement)

    expect(missileInput.value).toBe('Spark I Missile')
  })
})

/**
 * SW-013C.2F Amendment B — Required Automated Matrix, Eclipse section.
 * Extends Amendment A's own Eclipse coverage (geometry/save/reload,
 * `sw013c2fAmendmentAFinding1.test.tsx`) with this Amendment's specific
 * requirements: payload selection retained IMMEDIATELY (before save), and
 * correct readiness/procurement demand once saved.
 */
describe('SW-013C.2F Amendment B: Eclipse bomb rack matrix — immediate retention, readiness, procurement demand', () => {
  const cases = [
    { rackQuery: '1xS10', rackItem: 'Aegis Eclipse 1xS10 Bomb Rack', bombQuery: 'Colossus', bombItem: 'Colossus Bomb', childCount: 1 },
    { rackQuery: '4xS5', rackItem: 'Aegis Eclipse 4xS5 Bomb Rack', bombQuery: 'Stormburst', bombItem: 'Stormburst Bomb', childCount: 4 },
    { rackQuery: '20xS3', rackItem: 'Aegis Eclipse 20xS3 Bomb Rack', bombQuery: 'Thunderball', bombItem: 'Thunderball Bomb', childCount: 20 },
  ]

  for (const c of cases) {
    it(`${c.rackItem}: bomb selection remains visible immediately, and once saved produces correct procurement demand for all ${c.childCount} unowned unit(s)`, () => {
      if (catalogComponentsByName.size === 0) return
      const added = renderShipWorkspace('eclipse-imported')

      selectFirstOption('New target for Torpedorack', c.rackQuery)
      const bombInput = aggregateRowInputFor('Torpedorack')
      fireEvent.click(bombInput)
      fireEvent.change(bombInput, { target: { value: c.bombQuery } })
      const listbox = document.getElementById(bombInput.getAttribute('aria-controls')!) as HTMLElement
      fireEvent.click(listbox.querySelector('button') as HTMLButtonElement)

      // Retained immediately — before any save.
      expect(bombInput.value).toBe(c.bombItem)
      expect(pendingChangeCount()).toBeGreaterThan(0)

      fireEvent.click(screen.getAllByText('Save Changes')[0])
      expect(screen.queryByText(/Could not save/)).not.toBeInTheDocument()

      const state = useFleetStore.getState()
      const build = state.builds.find((b) => b.shipId === added.assetId)!
      const hardpoints = state.hardpoints.filter((h) => h.buildId === build.id)
      const children = hardpoints.filter((h) => h.parentSlotLabel === 'Torpedorack')
      expect(children).toHaveLength(c.childCount)
      for (const child of children) expect(child.targetItem).toBe(c.bombItem)

      // Readiness: a freshly-targeted, unowned bomb reads Missing, not OK.
      for (const child of children) expect(child.status).toBe('Missing')

      // Procurement: the fleet has zero of this bomb in Hangar, so every
      // real child slot's demand surfaces as a genuine shortage.
      const procurement = buildProcurementList(state.hardpoints, state.builds, state.ships, state.installedLoadouts, state.reservations, state.hangarItems)
      const demandLine = procurement.find((p) => p.itemName === c.bombItem)
      expect(demandLine).toBeDefined()
      expect(demandLine!.qtyNeeded).toBe(c.childCount)
    })
  }
})

/**
 * SW-013C.2F Amendment B — Required Automated Matrix, Parent Replacement.
 * A 20x S3 rack with payloads assigned, replaced with a 1x S10 rack: the
 * old S3 children must not survive as stale leftovers, the new S10 child
 * must appear immediately, and a payload compatible with the NEW rack
 * must be selectable and retained on it — never a stale target migrating
 * from the old geometry onto the new one.
 */
describe('SW-013C.2F Amendment B: parent rack replacement cleanly regenerates and re-targets children', () => {
  it('20xS3 rack with Thunderball Bomb assigned -> switch to 1xS10 -> old S3 children disappear, one S10 child appears, Colossus Bomb selects and retains on it', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('eclipse-imported')

    selectFirstOption('New target for Torpedorack', '20xS3')
    let bombInput = aggregateRowInputFor('Torpedorack')
    fireEvent.click(bombInput)
    fireEvent.change(bombInput, { target: { value: 'Thunderball' } })
    let listbox = document.getElementById(bombInput.getAttribute('aria-controls')!) as HTMLElement
    fireEvent.click(listbox.querySelector('button') as HTMLButtonElement)
    expect(bombInput.value).toBe('Thunderball Bomb')

    const rackRowBefore = screen.getAllByText('Torpedorack').find((el) => el.closest('tr') !== null)!.closest('tr') as HTMLElement
    const aggregateRowBefore = rackRowBefore.nextElementSibling as HTMLElement
    expect(aggregateRowBefore.textContent).toContain('×20')

    // Parent swap to the 1xS10 rack — old S3 children must not survive.
    selectFirstOption('New target for Torpedorack', '1xS10')
    const rackRowAfter = screen.getAllByText('Torpedorack').find((el) => el.closest('tr') !== null)!.closest('tr') as HTMLElement
    const aggregateRowAfter = rackRowAfter.nextElementSibling as HTMLElement
    expect(aggregateRowAfter.textContent).toContain('×1')
    expect(aggregateRowAfter.textContent).not.toContain('×20')
    // The stale Thunderball selection must not migrate onto the new S10 slot.
    expect(within(aggregateRowAfter).getByRole('combobox')).toHaveProperty('value', '—')

    // A payload compatible with the NEW (S10) rack selects and retains immediately.
    bombInput = within(aggregateRowAfter).getByRole('combobox') as HTMLInputElement
    fireEvent.click(bombInput)
    fireEvent.change(bombInput, { target: { value: 'Colossus' } })
    listbox = document.getElementById(bombInput.getAttribute('aria-controls')!) as HTMLElement
    fireEvent.click(listbox.querySelector('button') as HTMLButtonElement)
    expect(bombInput.value).toBe('Colossus Bomb')
  })
})

/**
 * SW-013C.2F Amendment B — Required Automated Matrix, Negative Controls.
 */
describe('SW-013C.2F Amendment B: negative controls', () => {
  it('Intentional Empty still works — selecting "—" on an aggregate payload row clears it immediately, no error', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('eclipse-imported')
    selectFirstOption('New target for Torpedorack', '20xS3')
    const bombInput = aggregateRowInputFor('Torpedorack')
    fireEvent.click(bombInput)
    fireEvent.change(bombInput, { target: { value: 'Thunderball' } })
    let listbox = document.getElementById(bombInput.getAttribute('aria-controls')!) as HTMLElement
    fireEvent.click(listbox.querySelector('button') as HTMLButtonElement)
    expect(bombInput.value).toBe('Thunderball Bomb')

    fireEvent.click(bombInput)
    fireEvent.change(bombInput, { target: { value: '' } })
    listbox = document.getElementById(bombInput.getAttribute('aria-controls')!) as HTMLElement
    const emptyOption = Array.from(listbox.querySelectorAll('button')).find((b) => b.textContent?.includes('Intentional Empty'))
    expect(emptyOption).toBeDefined()
    fireEvent.click(emptyOption!)
    expect(bombInput.value).toBe('—')
  })

  it('invalid-size payloads remain unavailable — a 20xS3 rack\'s aggregate picker never offers S5/S10 bombs', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('eclipse-imported')
    selectFirstOption('New target for Torpedorack', '20xS3')
    const bombInput = aggregateRowInputFor('Torpedorack')
    fireEvent.click(bombInput)
    fireEvent.change(bombInput, { target: { value: 'Bomb' } })
    const listbox = document.getElementById(bombInput.getAttribute('aria-controls')!) as HTMLElement
    const options = Array.from(listbox.querySelectorAll('button')).map((b) => b.textContent ?? '')
    expect(options.some((o) => o.includes('Stormburst'))).toBe(false) // S5
    expect(options.some((o) => o.includes('Colossus'))).toBe(false) // S10
    expect(options.some((o) => o.includes('Thunderball'))).toBe(true) // S3 — the one genuinely compatible bomb
  })

  it('factory Eclipse torpedo configuration remains intact when untouched — real 3x S9 torpedo children, no aggregation-driven mutation', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('eclipse-imported')
    const rackInput = screen.getByLabelText('New target for Torpedorack') as HTMLInputElement
    expect(rackInput.value).toBe('Aegis Eclipse Torpedo Rack')
    const aggregateInput = aggregateRowInputFor('Torpedorack')
    const aggregateRow = aggregateInput.closest('tr') as HTMLElement
    expect(aggregateRow.textContent).toContain('×3')
    expect(aggregateRow.textContent).toContain('S9')
  })

  it('Hornet multi-child weapon targets remain intact — independent-equipment children (wing gun mounts) stay individually addressable, never aggregated', () => {
    if (catalogComponentsByName.size === 0) return
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Manage Loadout/ }))
    for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)

    const leftMountRow = screen.getAllByText('Left Wing Weapon Mount').find((el) => el.closest('tr') !== null)!.closest('tr') as HTMLElement
    const rightMountRow = screen.getAllByText('Right Wing Weapon Mount').find((el) => el.closest('tr') !== null)!.closest('tr') as HTMLElement
    const leftChildRow = leftMountRow.nextElementSibling as HTMLElement
    const rightChildRow = rightMountRow.nextElementSibling as HTMLElement

    // Each wing's own child weapon slot is its own real row (never merged
    // into one shared aggregate the way a missile/bomb rack's children
    // are) — no "×N" count badge, and each is independently selectable.
    expect(leftChildRow.textContent).not.toMatch(/×\d/)
    expect(rightChildRow.textContent).not.toMatch(/×\d/)

    const leftChildInput = within(leftChildRow).getByRole('combobox') as HTMLInputElement
    const rightChildInput = within(rightChildRow).getByRole('combobox') as HTMLInputElement
    const leftBefore = leftChildInput.value
    const rightBefore = rightChildInput.value
    expect(leftBefore).not.toBe('')

    fireEvent.click(rightChildInput)
    fireEvent.change(rightChildInput, { target: { value: 'Omnisky' } })
    const listbox = document.getElementById(rightChildInput.getAttribute('aria-controls')!) as HTMLElement
    const options = Array.from(listbox.querySelectorAll('button'))
    if (options.length > 0) {
      fireEvent.click(options[0])
      // The RIGHT mount's own selection must never bleed into the LEFT
      // mount's own independent child — confirming this Amendment's
      // aggregate-row fix (gated on `hp.missileAggregate`) left
      // independent-equipment children completely untouched.
      expect(leftChildInput.value).toBe(leftBefore)
      expect(rightChildInput.value).not.toBe(rightBefore)
    }
  })
})
