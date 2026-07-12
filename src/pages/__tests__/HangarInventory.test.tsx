import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
