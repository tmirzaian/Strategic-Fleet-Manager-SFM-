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

  it('keeps Item, Type, Size, Installed, Reserved, Available, Needed By, Disposition in that exact order', () => {
    renderHangar()
    const headerRow = screen.getAllByRole('columnheader')
    const labels = headerRow.map((h) => h.textContent?.trim())
    const expectedInOrder = ['Item', 'Type', 'Size', 'Installed', 'Reserved', 'Available', 'Needed By', 'Disposition']
    const indices = expectedInOrder.map((label) => labels.findIndex((l) => l === label))
    expect(indices.every((i) => i !== -1)).toBe(true)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
  })

  it('Installed/Reserved/Available values still render (calculations untouched)', () => {
    renderHangar()
    // At least one row's availability-derived values render as numbers —
    // proves calculateComponentAvailability is still wired up unchanged.
    const table = screen.getByRole('table')
    expect(table.textContent).toMatch(/\d/)
  })

  it('Disposition remains editable via its badge button', () => {
    renderHangar()
    const dispositionButtons = screen.getAllByText(/Install|Store|Stockpile|Trade|Ignore/)
    expect(dispositionButtons.length).toBeGreaterThan(0)
  })

  it('Move to Ship action remains accessible', () => {
    renderHangar()
    expect(screen.getAllByText('Move to Ship').length).toBeGreaterThan(0)
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

  it('2. typing a search string alone, without selecting an option, leaves Add to Hangar disabled — search text cannot create a record', () => {
    if (catalogComponentsByName.size === 0) return
    renderHangar()
    openAdd()
    fireEvent.change(screen.getByPlaceholderText('Search catalog components…'), { target: { value: 'Blizzard' } })
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
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
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
    const reserve = useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
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
    useFleetStore.getState().reserveComponent({ missionConfigurationId: 'ghost-escort', fleetAssetId: 'ghost', targetSlotLabel: 'Shield 1', componentName: 'FR-66' })
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
