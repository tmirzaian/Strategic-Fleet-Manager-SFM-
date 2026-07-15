import { useState } from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import CatalogComponentSearch from '../CatalogComponentSearch'
import { catalogComponentsByName } from '../../generated/componentCatalog'

afterEach(() => cleanup())

function ControlledSearch() {
  const [selectedName, setSelectedName] = useState('')
  return <CatalogComponentSearch selectedName={selectedName} onSelect={setSelectedName} />
}

/**
 * EWO-030 (Task 1) — the one canonical catalog-driven component search
 * renderer, extracted from Hangar Inventory's own "Add New Item" modal so
 * it can be reused verbatim by Quick Update. These tests exercise the
 * shared component in isolation; Hangar Inventory's and Quick Update's own
 * test files separately confirm it's actually wired into each page.
 */
describe('<CatalogComponentSearch /> — EWO-030 (Task 1): canonical component search renderer', () => {
  it('1. renders the search input and a size=6 listbox, never a free-text-only field', () => {
    render(<ControlledSearch />)
    expect(screen.getByPlaceholderText('Search catalog components…')).toBeInTheDocument()
    expect(document.querySelector('select[size="6"]')).toBeInTheDocument()
  })

  it('2. a search narrow enough to leave exactly one catalog match auto-selects it', () => {
    if (!catalogComponentsByName.has('Blizzard')) return
    render(<ControlledSearch />)
    fireEvent.change(screen.getByPlaceholderText('Search catalog components…'), { target: { value: 'Blizzard' } })
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    expect(select.value).toBe('Blizzard')
  })

  it('3. a selected component shows its real Type and Size', () => {
    if (catalogComponentsByName.size === 0) return
    render(<ControlledSearch />)
    const search = screen.getByPlaceholderText('Search catalog components…')
    fireEvent.change(search, { target: { value: 'a' } })
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    const firstOption = select.querySelector('option') as HTMLOptionElement
    const name = firstOption.value
    const entry = catalogComponentsByName.get(name)!
    fireEvent.change(select, { target: { value: name } })
    expect(screen.getByText(entry.category)).toBeInTheDocument()
    expect(screen.getByText(`S${entry.size}`)).toBeInTheDocument()
  })

  it('4. a zero-match search shows the "no matching catalog component" message and clears any prior selection', () => {
    if (!catalogComponentsByName.has('Blizzard')) return
    render(<ControlledSearch />)
    const search = screen.getByPlaceholderText('Search catalog components…')
    fireEvent.change(search, { target: { value: 'Blizzard' } })
    expect((document.querySelector('select[size="6"]') as HTMLSelectElement).value).toBe('Blizzard')
    fireEvent.change(search, { target: { value: 'Zzzznonexistentxyz' } })
    expect(screen.getByText('No matching catalog component — free-text entries are not accepted.')).toBeInTheDocument()
    expect((document.querySelector('select[size="6"]') as HTMLSelectElement).value).toBe('')
  })
})
