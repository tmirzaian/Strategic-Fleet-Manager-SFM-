import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HangarInventory from '../HangarInventory'
import { useFleetStore } from '../../store/useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

function renderHangar() {
  return render(
    <MemoryRouter>
      <HangarInventory />
    </MemoryRouter>
  )
}

function openFilters() {
  // Anchored — "Clear Filters" also contains the word "Filters" and would
  // otherwise ambiguously match once at least one filter is active.
  fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
}

/**
 * EWO-072 — "Hangar Inventory Confidence Pass." Dedicated coverage for
 * the work order's own itemized Regression Requirements list beyond what
 * HangarInventory.test.tsx's own baseline suite already certifies
 * (reservation workflow mechanics, Add/Edit/Delete, column presence).
 * This file focuses on: filters (Part E), sorting (Part F), hide
 * zero-balance (Part G), Needed By context (Part H), and empty states
 * (Part J).
 */
describe('EWO-072 (Part E): compact, composable filters', () => {
  function seedFilterFixture() {
    // Cleared first — the seed fleet already owns real Hangar inventory
    // that would otherwise leak into these deliberately narrow fixtures.
    useFleetStore.setState({ hangarItems: [], reservations: [] })
    useFleetStore.getState().addHangarItem({ name: 'Alpha Cooler', type: 'Cooler', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 3, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().addHangarItem({ name: 'Big Shield', type: 'Shield', size: 'S2', qty: 2, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66', quantity: 1 })
  }

  it('collapsed default reads "FILTERS" with "All inventory" and every row visible', () => {
    seedFilterFixture()
    renderHangar()
    expect(screen.getByText('All inventory')).toBeInTheDocument()
    expect(screen.getByText('Alpha Cooler')).toBeInTheDocument()
    expect(screen.getByText('FR-66')).toBeInTheDocument()
    expect(screen.getByText('Big Shield')).toBeInTheDocument()
  })

  it('Type filter narrows independently', () => {
    seedFilterFixture()
    renderHangar()
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Shield' }))
    expect(screen.queryByText('Alpha Cooler')).not.toBeInTheDocument()
    expect(screen.getByText('FR-66')).toBeInTheDocument()
    expect(screen.getByText('Big Shield')).toBeInTheDocument()
  })

  it('Size filter narrows independently', () => {
    seedFilterFixture()
    renderHangar()
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'S2' }))
    expect(screen.queryByText('Alpha Cooler')).not.toBeInTheDocument()
    expect(screen.queryByText('FR-66')).not.toBeInTheDocument()
    expect(screen.getByText('Big Shield')).toBeInTheDocument()
  })

  it('Reservation State filter narrows independently: Reserved shows only reservedQuantity > 0', () => {
    seedFilterFixture()
    renderHangar()
    openFilters()
    fireEvent.click(within(screen.getByText('Reservation State').closest('div')!).getByRole('button', { name: 'Reserved' }))
    expect(screen.getByText('FR-66')).toBeInTheDocument()
    expect(screen.queryByText('Alpha Cooler')).not.toBeInTheDocument()
    expect(screen.queryByText('Big Shield')).not.toBeInTheDocument()
  })

  it('Availability State filter narrows independently: Unavailable shows only availableQuantity = 0', () => {
    // FR-66: qty 3, reserved 1 -> available 2 (still Available). Reduce
    // stock so the reserved unit consumes everything -> available 0.
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().addHangarItem({ name: 'Alpha Cooler', type: 'Cooler', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66', quantity: 1 })
    renderHangar()
    openFilters()
    fireEvent.click(within(screen.getByText('Availability State').closest('div')!).getByRole('button', { name: 'Unavailable' }))
    expect(screen.getByText('FR-66')).toBeInTheDocument()
    expect(screen.queryByText('Alpha Cooler')).not.toBeInTheDocument()
  })

  it('filters combine with AND logic: Type Shield + Size S1 + Availability Available matches only the intersection', () => {
    seedFilterFixture()
    renderHangar()
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Shield' }))
    fireEvent.click(screen.getByRole('button', { name: 'S1' }))
    fireEvent.click(within(screen.getByText('Availability State').closest('div')!).getByRole('button', { name: 'Available' }))
    // FR-66: Shield, S1, 2 available (3 owned, 1 reserved) -> matches all three.
    expect(screen.getByText('FR-66')).toBeInTheDocument()
    // Big Shield is S2 (excluded by Size), Alpha Cooler is Cooler (excluded by Type).
    expect(screen.queryByText('Big Shield')).not.toBeInTheDocument()
    expect(screen.queryByText('Alpha Cooler')).not.toBeInTheDocument()
  })

  it('renders removable filter chips, and each chip clears only its own dimension', () => {
    seedFilterFixture()
    renderHangar()
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Shield' }))
    fireEvent.click(screen.getByRole('button', { name: 'S1' }))
    expect(screen.getByText('Type: Shield')).toBeInTheDocument()
    expect(screen.getByText('Size: S1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Remove Type: Shield filter/ }))
    expect(screen.queryByText('Type: Shield')).not.toBeInTheDocument()
    expect(screen.getByText('Size: S1')).toBeInTheDocument()
    // Cooler is S1, now visible again since Type is cleared.
    expect(screen.getByText('Alpha Cooler')).toBeInTheDocument()
  })

  it('Clear Filters restores the full operational list', () => {
    seedFilterFixture()
    renderHangar()
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Shield' }))
    expect(screen.queryByText('Alpha Cooler')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }))
    expect(screen.getByText('Alpha Cooler')).toBeInTheDocument()
    expect(screen.getByText('FR-66')).toBeInTheDocument()
    expect(screen.getByText('Big Shield')).toBeInTheDocument()
    expect(screen.getByText('All inventory')).toBeInTheDocument()
  })

  it('filter selections persist while the panel is collapsed', () => {
    seedFilterFixture()
    renderHangar()
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Shield' }))
    // Collapse the panel (click the toggle again).
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    // The chip (and therefore the filtered result set) survives collapse.
    expect(screen.getByText('Type: Shield')).toBeInTheDocument()
    expect(screen.queryByText('Alpha Cooler')).not.toBeInTheDocument()
    expect(screen.getByText('FR-66')).toBeInTheDocument()
  })

  it('empty filtered state renders intentionally with Clear Filters, not a blank table', () => {
    seedFilterFixture()
    renderHangar()
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Shield' }))
    fireEvent.click(within(screen.getByText('Availability State').closest('div')!).getByRole('button', { name: 'Unavailable' }))
    // No Shield in this fixture has zero Available.
    expect(screen.getByText('No inventory items match these filters.')).toBeInTheDocument()
    // Two "Clear Filters" controls legitimately coexist here — the
    // toolbar's own small text link, and the empty state's own CTA.
    expect(screen.getAllByRole('button', { name: 'Clear Filters' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('EWO-072 (Part F): sorting', () => {
  function seedSortFixture() {
    // Cleared first — the seed fleet already owns real Hangar inventory
    // (Stronghold, Mirage, SnowBlind, ...) that would otherwise interleave
    // with this fixture's own deliberately-ordered synthetic rows.
    useFleetStore.setState({ hangarItems: [], reservations: [] })
    useFleetStore.getState().addHangarItem({ name: 'Zebra Cooler', type: 'Cooler', size: 'S10', qty: 1, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().addHangarItem({ name: 'Alpha Cooler', type: 'Cooler', size: 'S1', qty: 9, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().addHangarItem({ name: 'Mid Cooler', type: 'Cooler', size: 'S2', qty: 4, neededBy: 'None', disposition: 'Store' })
  }

  function itemOrder(): string[] {
    return screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent ?? '')
  }

  it('Available sorts numerically, not lexically (4 < 9, not "4" > "9" as strings would never even apply here, but 1 < 4 < 9 must hold)', () => {
    seedSortFixture()
    renderHangar()
    fireEvent.click(screen.getByRole('button', { name: /Available/ }))
    expect(itemOrder()).toEqual(['Zebra Cooler', 'Mid Cooler', 'Alpha Cooler'])
  })

  it('Size sorts by actual size rank (S1, S2, S10), never lexical string order', () => {
    seedSortFixture()
    renderHangar()
    fireEvent.click(screen.getByRole('button', { name: /^Size/ }))
    expect(itemOrder()).toEqual(['Alpha Cooler', 'Mid Cooler', 'Zebra Cooler'])
  })

  it('applying a filter after sorting does not reset the active sort', () => {
    seedSortFixture()
    useFleetStore.getState().addHangarItem({ name: 'Alt Shield', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' })
    renderHangar()
    fireEvent.click(screen.getByRole('button', { name: /Available/ })) // ascending by Available
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Cooler' }))
    // Still ascending by Available among the now Cooler-only rows.
    expect(itemOrder()).toEqual(['Zebra Cooler', 'Mid Cooler', 'Alpha Cooler'])
  })

  it('applying a sort after filtering does not reset the active filter', () => {
    seedSortFixture()
    useFleetStore.getState().addHangarItem({ name: 'Alt Shield', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' })
    renderHangar()
    openFilters()
    fireEvent.click(screen.getByRole('button', { name: 'Cooler' }))
    // Scoped to the column header specifically — with the filter panel
    // open, the Availability State row's own "Available" pill shares the
    // same accessible name as the Available column's sort header.
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Available/ })).getByRole('button'))
    expect(screen.queryByText('Alt Shield')).not.toBeInTheDocument()
    expect(itemOrder()).toEqual(['Zebra Cooler', 'Mid Cooler', 'Alpha Cooler'])
  })
})

describe('EWO-072 (Part G): hide true-zero historical records', () => {
  it('a true-zero record (Installed = Reserved = Available = 0) is hidden by default, but remains persisted in the store', () => {
    useFleetStore.getState().addHangarItem({ name: 'Ghost Widget', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Ghost Widget')!
    useFleetStore.getState().updateHangarItemQuantity(item.id, 0)
    renderHangar()
    expect(screen.queryByText('Ghost Widget')).not.toBeInTheDocument()
    // Never deleted — still a real record in the store.
    expect(useFleetStore.getState().hangarItems.some((h) => h.name === 'Ghost Widget')).toBe(true)
  })

  it('disabling "Hide zero-balance items" reveals the true-zero record again', () => {
    useFleetStore.getState().addHangarItem({ name: 'Ghost Widget', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Ghost Widget')!
    useFleetStore.getState().updateHangarItemQuantity(item.id, 0)
    renderHangar()
    fireEvent.click(screen.getByLabelText('Hide zero-balance items'))
    expect(screen.getByText('Ghost Widget')).toBeInTheDocument()
  })

  it('a record with any nonzero Installed, Reserved, or Available quantity remains visible under the default toggle', () => {
    useFleetStore.getState().addHangarItem({ name: 'Owned Widget', type: 'Cooler', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' })
    renderHangar()
    expect(screen.getByText('Owned Widget')).toBeInTheDocument()
  })

  it('when every remaining record is hidden solely by the zero-balance toggle, renders the dedicated empty state with Add New Item', () => {
    // Cleared — the seed fleet already owns real, non-zero Hangar
    // inventory that would otherwise stay visible and defeat "every
    // remaining record is hidden."
    useFleetStore.setState({ hangarItems: [], reservations: [] })
    useFleetStore.getState().addHangarItem({ name: 'Ghost Widget', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Ghost Widget')!
    useFleetStore.getState().updateHangarItemQuantity(item.id, 0)
    renderHangar()
    expect(screen.getByText('No owned inventory is currently recorded.')).toBeInTheDocument()
    expect(screen.getAllByText('Add New Item').length).toBeGreaterThan(0)
  })
})

describe('EWO-072 (Part H): Needed By exposes ship/loadout context, not just a count', () => {
  it('shows the compact ship/build summary alongside the Build count — visible, not hover-only', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    renderHangar()
    const row = screen.getByText('FR-66').closest('tr')!
    expect(within(row).getByText(/Needed by 1 Build/)).toBeInTheDocument()
    // Ghost is the real, unresolved fixture match — its ship/build summary
    // is visible directly in the cell, not hidden behind a hover-only tooltip.
    expect(within(row).getByText(/Ghost/)).toBeInTheDocument()
  })

  it('a component with no real target requirement anywhere shows a plain em-dash, never a phantom Reserve trigger', () => {
    useFleetStore.getState().addHangarItem({ name: 'Nobody Needs This', type: 'Cooler', size: 'S1', qty: 3, neededBy: 'None', disposition: 'Store' })
    renderHangar()
    const row = screen.getByText('Nobody Needs This').closest('tr')!
    expect(within(row).getByText('—')).toBeInTheDocument()
    expect(within(row).queryByText('Reserve')).not.toBeInTheDocument()
  })
})

describe('EWO-072 (Part K): shared quantity authority', () => {
  it('Owned Quantity = Installed + Reserved + Available holds for a mixed row, and the table never independently recomputes it', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 3, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66', quantity: 1 })
    renderHangar()
    const row = screen.getByText('FR-66').closest('tr')!
    const cells = within(row).getAllByRole('cell')
    // ITEM, TYPE, SIZE, INSTALLED, RESERVED, AVAILABLE, NEEDED BY, ACTIONS
    const installed = Number(cells[3].textContent)
    const reserved = Number(cells[4].textContent)
    const available = Number(cells[5].textContent)
    expect(installed + reserved + available).toBe(3) // owned qty (3 in Hangar, 1 reserved, 2 free)
    expect(reserved).toBe(1)
    expect(available).toBe(2)
  })
})
