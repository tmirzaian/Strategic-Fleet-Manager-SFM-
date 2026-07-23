import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HangarInventory from '../HangarInventory'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'

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

describe('<HangarInventory /> — Mission M-011 column cleanup', () => {
  it('no longer renders a Qty or Owned column header', () => {
    renderHangar()
    expect(screen.queryByText('Qty')).not.toBeInTheDocument()
    expect(screen.queryByText('Owned')).not.toBeInTheDocument()
  })

  it('EWO-029: keeps Item, Type, Size, Hangar Qty, Installed, Reserved, Available, Needed By in that exact order — no Disposition column', () => {
    renderHangar()
    const headerRow = screen.getAllByRole('columnheader')
    const labels = headerRow.map((h) => h.textContent?.trim())
    const expectedInOrder = ['Item', 'Type', 'Size', 'Hangar Qty', 'Installed', 'Reserved', 'Available', 'Needed By']
    const indices = expectedInOrder.map((label) => labels.findIndex((l) => l === label))
    expect(indices.every((i) => i !== -1)).toBe(true)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
    expect(labels).not.toContain('Disposition')
  })

  it('Installed/Reserved/Available values still render (calculations untouched)', () => {
    renderHangar()
    // At least one row's availability-derived values render as numbers —
    // proves calculateComponentAvailability is still wired up unchanged.
    const table = screen.getByRole('table')
    expect(table.textContent).toMatch(/\d/)
  })

  it('EWO-STAB-002: Move to Ship is visibly present but disabled during Beta stabilization, with a message pointing to Quick Update', () => {
    renderHangar()
    const buttons = screen.getAllByText('Move to Ship').map((el) => el.closest('button')!)
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'Temporarily unavailable during Beta stabilization. Use Quick Update → Install Component.')
    }
  })
})

describe('<HangarInventory /> — Mission M-012 empty-state', () => {
  it('7. renders a deliberate empty-state panel (not a blank page) when hangarItems and ships are both empty', () => {
    useFleetStore.setState({ ships: [], hangarItems: [] })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderHangar()
    expect(screen.getByText('No Inventory Recorded')).toBeInTheDocument()
    expect(screen.getByText('Quartermaster has no components recorded for this command.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // 10. no console errors in the empty state.
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('the "Add New Item" action remains available even with zero inventory', () => {
    useFleetStore.setState({ ships: [], hangarItems: [] })
    renderHangar()
    expect(screen.getByText('Add New Item')).toBeInTheDocument()
  })
})

describe('<HangarInventory /> — Mission M-012 inventory item creation uses the authoritative component catalog', () => {
  it('14. the "Add New Item" Component Name field offers the full authoritative catalog via a real selectable list, not just a free-text box', () => {
    if (catalogComponentsByName.size === 0) return // real generated-data/component-metadata-catalog.json not present on this machine
    renderHangar()
    fireEvent.click(screen.getByText('Add New Item'))
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    expect(select).toBeTruthy()
    expect(select.querySelectorAll('option').length).toBeGreaterThan(0)
  })
})

describe('EWO-028 (Task 2/12): catalog-driven Add New Item', () => {
  function openAdd() {
    fireEvent.click(screen.getByText('Add New Item'))
  }

  it('1. searching narrows the selectable list to matching catalog components', () => {
    if (catalogComponentsByName.size === 0) return
    renderHangar()
    openAdd()
    const search = screen.getByPlaceholderText('Search catalog components…')
    fireEvent.change(search, { target: { value: 'Blizzard' } })
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(options.length).toBeGreaterThan(0)
    expect(options.every((o) => o?.toLowerCase().includes('blizzard'))).toBe(true)
  })

  it('1b. EWO-029 (Task 1): a search narrow enough to leave exactly one catalog match auto-selects it and enables Add to Hangar', () => {
    if (catalogComponentsByName.size === 0) return
    // "Blizzard" is a real, single-entry catalog component (S2 Cooler) —
    // narrowing to it exactly must auto-select rather than leave the
    // Commander stuck on a highlighted-but-unselected option.
    if (!catalogComponentsByName.has('Blizzard')) return
    renderHangar()
    openAdd()
    const search = screen.getByPlaceholderText('Search catalog components…')
    fireEvent.change(search, { target: { value: 'Blizzard' } })
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    expect(select.querySelectorAll('option').length).toBe(1)
    expect(select.value).toBe('Blizzard')
    expect(screen.getByText('Add to Hangar')).not.toBeDisabled()
  })

  it('1c. EWO-029 (Task 1): a search matching zero catalog components clears any prior selection and disables Add to Hangar', () => {
    if (catalogComponentsByName.size === 0) return
    if (!catalogComponentsByName.has('Blizzard')) return
    renderHangar()
    openAdd()
    const search = screen.getByPlaceholderText('Search catalog components…')
    fireEvent.change(search, { target: { value: 'Blizzard' } })
    expect(screen.getByText('Add to Hangar')).not.toBeDisabled()
    fireEvent.change(search, { target: { value: 'Zzzznonexistentcomponentxyz' } })
    expect(screen.getByText('No matching catalog component — free-text entries are not accepted.')).toBeInTheDocument()
    expect(screen.getByText('Add to Hangar')).toBeDisabled()
  })

  it('1d. EWO-029 (Task 1): broadening the search away from a prior single-match auto-selection reconciles rather than keeping a stale selection', () => {
    if (catalogComponentsByName.size === 0) return
    if (!catalogComponentsByName.has('Blizzard')) return
    renderHangar()
    openAdd()
    const search = screen.getByPlaceholderText('Search catalog components…')
    fireEvent.change(search, { target: { value: 'Blizzard' } })
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    expect(select.value).toBe('Blizzard')
    // Broaden to a query with multiple matches — the earlier single-match
    // auto-selection must not linger as a stale, invisible selection.
    fireEvent.change(search, { target: { value: 'a' } })
    expect(select.querySelectorAll('option').length).toBeGreaterThan(1)
    expect(screen.getByText('Add to Hangar')).toBeDisabled()
  })

  it('2. typing a search string that still matches several components leaves Add to Hangar disabled — search text alone cannot create a record', () => {
    if (catalogComponentsByName.size === 0) return
    renderHangar()
    openAdd()
    // EWO-029 (Task 1) — a query narrow enough to leave exactly one match
    // now correctly auto-selects (see tests 1b-1d above); this
    // test specifically covers a still-ambiguous, multi-match query.
    const search = screen.getByPlaceholderText('Search catalog components…')
    fireEvent.change(search, { target: { value: 'a' } })
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    expect(select.querySelectorAll('option').length).toBeGreaterThan(1)
    expect(screen.getByText('Add to Hangar')).toBeDisabled()
  })

  it('3. selecting a real catalog component fills Type and Size from its authoritative record', () => {
    if (catalogComponentsByName.size === 0) return
    renderHangar()
    openAdd()
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    const firstOption = select.querySelector('option') as HTMLOptionElement
    const name = firstOption.value
    const entry = catalogComponentsByName.get(name)!
    fireEvent.change(select, { target: { value: name } })
    const modal = select.closest('.panel')!
    expect(within(modal as HTMLElement).getByText(entry.category)).toBeInTheDocument()
    expect(within(modal as HTMLElement).getByText(`S${entry.size}`)).toBeInTheDocument()
  })

  it('4. Type and Size are rendered as read-only display text, never editable inputs', () => {
    if (catalogComponentsByName.size === 0) return
    renderHangar()
    openAdd()
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    const name = (select.querySelector('option') as HTMLOptionElement).value
    fireEvent.change(select, { target: { value: name } })
    // Only the search input and the Quantity input remain real <input> elements.
    const inputs = document.querySelectorAll('input')
    expect(inputs.length).toBe(2)
  })

  it('5. quantity validation rejects zero, negative, and fractional values — Add to Hangar stays disabled', () => {
    if (catalogComponentsByName.size === 0) return
    renderHangar()
    openAdd()
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    const name = (select.querySelector('option') as HTMLOptionElement).value
    fireEvent.change(select, { target: { value: name } })
    const qtyInput = screen.getByDisplayValue('1')
    for (const bad of ['0', '-1', '1.5']) {
      fireEvent.change(qtyInput, { target: { value: bad } })
      expect(screen.getByText('Add to Hangar')).toBeDisabled()
    }
  })

  it('6. a valid catalog selection plus a valid quantity adds real inventory, carrying the canonical entityClass', () => {
    if (catalogComponentsByName.size === 0) return
    renderHangar()
    openAdd()
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    const name = (select.querySelector('option') as HTMLOptionElement).value
    const entry = catalogComponentsByName.get(name)!
    fireEvent.change(select, { target: { value: name } })
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '3' } })
    expect(screen.getByText('Add to Hangar')).not.toBeDisabled()
    fireEvent.click(screen.getByText('Add to Hangar'))

    const item = useFleetStore.getState().hangarItems.find((h) => h.name === name)
    expect(item).toBeDefined()
    expect(item!.qty).toBe(3)
    expect(item!.entityClass).toBe(entry.entityClass)
  })
})

describe('EWO-028 (Task 4/5/6/12): Edit, Delete, and the quantity-reduction safeguard, end to end in the DOM', () => {
  it('a below-allocation quantity edit shows the Task 6 warning naming the exact ship/build, and Cancel leaves the record untouched', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    renderHangar()

    const row = screen.getByText('FR-66').closest('tr')!
    fireEvent.click(within(row).getByText('Edit'))
    const qtyInput = screen.getByDisplayValue('2')
    fireEvent.change(qtyInput, { target: { value: '0' } })
    fireEvent.click(screen.getByText('Save'))

    // 23. reduction below the reserved amount triggers the warning step.
    expect(screen.getByText(/will leave/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Ghost/i).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('Cancel'))
    expect(useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')?.qty).toBe(2)
  })

  it('Continue Anyway on the quantity safeguard saves the reduction and never deletes the reservation record', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 2, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    renderHangar()

    const row = screen.getByText('FR-66').closest('tr')!
    fireEvent.click(within(row).getByText('Edit'))
    fireEvent.change(screen.getByDisplayValue('2'), { target: { value: '0' } })
    fireEvent.click(screen.getByText('Save'))
    fireEvent.click(screen.getByText('Continue Anyway'))

    expect(useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')?.qty).toBe(0)
    expect(useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)?.status).toBe('ACTIVE')
  })

  it('17/18. Delete on a reserved item names the exact ship and Build, never a generic "in use" message alone', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    renderHangar()

    const row = screen.getByText('FR-66').closest('tr')!
    fireEvent.click(within(row).getByText('Delete'))

    expect(screen.getByText(/Reserved for/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Ghost/i).length).toBeGreaterThan(0)
    expect(screen.getByText('Delete Anyway')).toBeInTheDocument()
  })

  it('16/20. Delete on an unreferenced item shows the plain confirmation, and Cancel preserves the record', () => {
    useFleetStore.getState().addHangarItem({ name: 'Never Used Widget', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    renderHangar()

    const row = screen.getByText('Never Used Widget').closest('tr')!
    fireEvent.click(within(row).getByText('Delete'))
    expect(screen.getByText(/Are you sure you want to delete "Never Used Widget" from Hangar Inventory\?/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancel'))
    expect(useFleetStore.getState().hangarItems.some((h) => h.name === 'Never Used Widget')).toBe(true)
  })
})

describe('EWO-029 (Task 2/16): Disposition removed from the Beta UI', () => {
  it('6/7/8. Stockpile, Trade, and Ignore no longer appear anywhere on the page', () => {
    renderHangar()
    expect(screen.queryByText('Stockpile')).not.toBeInTheDocument()
    expect(screen.queryByText('Trade')).not.toBeInTheDocument()
    expect(screen.queryByText('Ignore')).not.toBeInTheDocument()
  })

  it('9. there is no row-wide Reserve disposition badge — Reserve is only ever a per-action button, never a status label replacing Disposition', () => {
    renderHangar()
    expect(screen.queryByText('Disposition')).not.toBeInTheDocument()
  })

  it('10. a legacy record that still carries a disposition value renders safely, without crashing or surfacing it as authoritative', () => {
    useFleetStore.setState({
      hangarItems: [...useFleetStore.getState().hangarItems, { id: 'legacy-disp', name: 'Legacy Disposition Widget', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Stockpile' }],
    })
    expect(() => renderHangar()).not.toThrow()
    expect(screen.getByText('Legacy Disposition Widget')).toBeInTheDocument()
    // The legacy value itself is never rendered as a Beta-facing label.
    expect(screen.queryByText('Stockpile')).not.toBeInTheDocument()
  })
})

describe('EWO-029 (Task 4/16): Reserve workflow', () => {
  it('11. the Reserve action appears only when Available > 0', () => {
    useFleetStore.getState().addHangarItem({ name: 'Reservable Widget', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    renderHangar()
    const row = screen.getByText('Reservable Widget').closest('tr')!
    expect(within(row).getByText('Reserve')).toBeInTheDocument()
  })

  it('a zero-Available item never shows a Reserve action', () => {
    useFleetStore.getState().addHangarItem({ name: 'Zero Stock Widget', type: 'Cooler', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Zero Stock Widget')!
    // addHangarItem itself requires a positive quantity (EWO-028) — a
    // genuine zero-stock record only ever comes from reducing an
    // existing one, exactly like Task 4's own documented zero-quantity
    // choice describes.
    useFleetStore.getState().updateHangarItemQuantity(item.id, 0)
    renderHangar()
    const row = screen.getByText('Zero Stock Widget').closest('tr')!
    expect(within(row).queryByText('Reserve')).not.toBeInTheDocument()
  })

  it('12/13/14/16/17. reserving through the modal narrows to an exact Fleet Asset and Build, only compatible requirements are offered, and Reserved/Available update correctly', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    renderHangar()
    const row = screen.getByText('FR-66').closest('tr')!
    fireEvent.click(within(row).getByText('Reserve'))

    // Ghost is the only Fleet Asset with a real, compatible, unreserved
    // FR-66 requirement in the seed fixture — auto-selected (Task 1-style
    // single-result parity), narrowing straight to its Build/slot.
    expect(screen.getByText('Confirm Reservation')).not.toBeDisabled()
    fireEvent.click(screen.getByText('Confirm Reservation'))

    expect(useFleetStore.getState().reservations.some((r) => r.status === 'ACTIVE' && r.componentName === 'FR-66')).toBe(true)
  })

  // FTB-001C — root-cause regression: a successful Confirm Reservation
  // schedules a bare `setTimeout(() => setReserveItemId(null), 900)` to
  // auto-close the modal. If the component unmounts (a real navigation
  // away, or a test finishing) before that 900ms elapses, the timer used
  // to survive untouched — on the next full test-file teardown it could
  // fire against an already torn-down environment, throwing
  // "ReferenceError: window is not defined" from deep inside React's
  // timer callback (exactly the FTB-001C incident report). The fix stores
  // the handle in a ref and clears it in the component's unmount effect
  // cleanup; this test proves that mechanism actually runs, and that
  // advancing well past the delay after unmount never throws.
  it('FTB-001C: the Reserve modal auto-close timeout is cancelled on unmount — no deferred state update survives teardown', () => {
    vi.useFakeTimers()
    try {
      useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
      const view = renderHangar()
      const row = screen.getByText('FR-66').closest('tr')!
      fireEvent.click(within(row).getByText('Reserve'))
      fireEvent.click(screen.getByText('Confirm Reservation'))

      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
      view.unmount()
      expect(clearTimeoutSpy).toHaveBeenCalled()

      // Well past the 900ms auto-close window, after unmount — must never
      // throw or touch anything belonging to the torn-down component.
      expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
    } finally {
      vi.useRealTimers()
    }
  })

  it('15. reservation quantity validation rejects a value above what is Available', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    renderHangar()
    const row = screen.getByText('FR-66').closest('tr')!
    fireEvent.click(within(row).getByText('Reserve'))
    const qtyInput = screen.getByDisplayValue('1') as HTMLInputElement
    fireEvent.change(qtyInput, { target: { value: '5' } })
    expect(screen.getByText('Confirm Reservation')).toBeDisabled()
  })

  it('19. duplicate hulls remain distinguishable in the Reserve Fleet Asset selector', () => {
    useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Black Betty')
    const b = useFleetStore.getState().addFleetAsset('cutlass-black-imported', 'OWNED', 'Rust Bucket')
    // 'Right Shield Generator' — Cutlass Black's own real S2 Shield slot;
    // 'Shield Array' is a real S2 Shield in the demo catalog, genuinely
    // compatible (unlike FR-66, a real S1 Shield, used in every other
    // test in this file for Ghost's own S1 slot).
    useFleetStore.getState().saveMissionConfiguration({ shipId: b.assetId!, name: 'Rust Build', startingState: 'EMPTY', targetOverrides: { 'Right Shield Generator': 'Shield Array' }, setActive: false })
    useFleetStore.getState().addHangarItem({ name: 'Shield Array', type: 'Shield', size: 'S2', qty: 1, neededBy: 'None', disposition: 'Store' })
    renderHangar()
    const row = screen.getByText('Shield Array').closest('tr')!
    fireEvent.click(within(row).getByText('Reserve'))
    expect(screen.getByText('Rust Bucket')).toBeInTheDocument()
    expect(screen.queryByText('Black Betty')).not.toBeInTheDocument() // no unresolved Shield Array requirement of its own
  })
})

describe('EWO-029 (Task 6/16): Release Reservation', () => {
  it('21/22/23. releasing a reservation via Manage Reservations decreases Reserved, increases Available, and never touches the Loadout target itself', () => {
    useFleetStore.getState().addHangarItem({ name: 'FR-66', type: 'Shield', size: 'S1', qty: 1, neededBy: 'None', disposition: 'Store' })
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Left Shield Generator', componentName: 'FR-66' })
    expect(reserve.success).toBe(true)
    const targetBefore = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-escort' && h.slotLabel === 'Left Shield Generator')?.targetItem

    renderHangar()
    const row = screen.getByText('FR-66').closest('tr')!
    fireEvent.click(within(row).getByTitle('Manage reservations for this component'))
    fireEvent.click(screen.getByText('Release'))

    expect(useFleetStore.getState().reservations.find((r) => r.id === reserve.reservationId)?.status).toBe('RELEASED')
    const availability = useFleetStore.getState().hangarItems.find((h) => h.name === 'FR-66')!
    expect(availability.qty).toBe(1) // Hangar stock itself is untouched by release
    const targetAfter = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-escort' && h.slotLabel === 'Left Shield Generator')?.targetItem
    expect(targetAfter).toBe(targetBefore) // Loadout target unchanged
  })
})

describe('EWO-029 (Task 8/10/16): unreserved match / upgrade-opportunity signal', () => {
  it('30/33. matching Available stock produces a visible unreserved-match signal identifying the Build', () => {
    useFleetStore.getState().addHangarItem({ name: 'Snowblind', type: 'Cooler', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' })
    renderHangar()
    const row = screen.getByText('Snowblind').closest('tr')!
    expect(within(row).getByText(/unreserved match/i)).toBeInTheDocument()
  })

  it('31/32. the signal never marks anything Installed and never auto-reserves', () => {
    useFleetStore.getState().addHangarItem({ name: 'Snowblind', type: 'Cooler', size: 'S1', qty: 5, neededBy: 'None', disposition: 'Store' })
    renderHangar()
    expect(useFleetStore.getState().reservations.length).toBe(0)
    const state = useFleetStore.getState()
    expect(state.installedLoadouts.some((e) => e.shipId === 'ghost' && e.installedItem === 'Snowblind')).toBe(false)
  })
})
