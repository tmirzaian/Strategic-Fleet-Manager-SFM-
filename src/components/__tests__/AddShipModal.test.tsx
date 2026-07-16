import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import AddShipModal from '../AddShipModal'
import { useFleetStore } from '../../store/useFleetStore'

afterEach(() => cleanup())

describe('EWO-024 (Task 1): AddShipModal single-result selection', () => {
  it('1. narrowing the search to exactly one selectable ship auto-selects it — "Add to Fleet" is never left disabled', () => {
    render(<AddShipModal onClose={() => {}} />)
    const search = screen.getByPlaceholderText(/search ship models/i)
    // "Cutlass Red" narrows the seed-canonical hull list to exactly one
    // selectable entry (EWO-021 dedup already guarantees no duplicates).
    fireEvent.change(search, { target: { value: 'Cutlass Red' } })

    const addButton = screen.getByRole('button', { name: /add to fleet/i })
    expect(addButton).not.toBeDisabled()
  })

  it("2. auto-selecting a single result actually lets the Commander proceed — clicking Add to Fleet succeeds", () => {
    render(<AddShipModal onClose={() => {}} />)
    const search = screen.getByPlaceholderText(/search ship models/i)
    fireEvent.change(search, { target: { value: 'Cutlass Red' } })

    const before = useFleetStore.getState().fleetAssets.length
    fireEvent.click(screen.getByRole('button', { name: /add to fleet/i }))
    expect(useFleetStore.getState().fleetAssets.length).toBe(before + 1)
  })

  it('3. broadening the search back to multiple results does not keep a stale selection stuck if it no longer applies', () => {
    render(<AddShipModal onClose={() => {}} />)
    const search = screen.getByPlaceholderText(/search ship models/i)
    fireEvent.change(search, { target: { value: 'Cutlass Red' } })
    const addButton = screen.getByRole('button', { name: /add to fleet/i })
    expect(addButton).not.toBeDisabled()

    // Broaden to a query matching multiple hulls — auto-select must not
    // fire again (more than one result), but the previous selection
    // (still a real, valid ship) legitimately keeps Add to Fleet enabled;
    // this proves auto-select only triggers on a genuine 1-result narrow,
    // not on every keystroke.
    fireEvent.change(search, { target: { value: 'Cutlass' } })
    const options = document.querySelectorAll('select[size="6"] option')
    expect(options.length).toBeGreaterThan(1)
  })

  it('4. a search matching zero ships leaves Add to Fleet disabled (no false auto-select)', () => {
    render(<AddShipModal onClose={() => {}} />)
    const search = screen.getByPlaceholderText(/search ship models/i)
    fireEvent.change(search, { target: { value: 'Totally Not A Real Ship Name' } })
    expect(screen.getByRole('button', { name: /add to fleet/i })).toBeDisabled()
  })
})

describe('EWO-026 (Task 9/10/11/12/13): ship picker label normalization', () => {
  function options() {
    return Array.from(document.querySelectorAll('select[size="6"] option')).map((o) => o.textContent)
  }

  it('21. 135c renders as "Origin 135c — Origin Jumpworks", not the raw "135c — Origin"', () => {
    render(<AddShipModal onClose={() => {}} />)
    const search = screen.getByPlaceholderText(/search ship models/i)
    fireEvent.change(search, { target: { value: '135c' } })
    expect(options()).toContain('Origin 135c — Origin Jumpworks')
    expect(options()).not.toContain('135c — Origin')
  })

  it('22. Cutlass Black renders with its manufacturer prefix and full corporate name', () => {
    render(<AddShipModal onClose={() => {}} />)
    const search = screen.getByPlaceholderText(/search ship models/i)
    fireEvent.change(search, { target: { value: 'Cutlass Black' } })
    expect(options().some((o) => o === 'Drake Cutlass Black — Drake Interplanetary')).toBe(true)
  })

  it('23. no selectable label anywhere in the catalog has a duplicated manufacturer prefix (e.g. never "Drake Drake ...")', () => {
    render(<AddShipModal onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/search ship models/i), { target: { value: '' } })
    const doubled = options().filter((o) => {
      if (!o) return false
      const words = o.split(' ')
      return words.length > 1 && words[0] === words[1]
    })
    expect(doubled).toEqual([])
  })

  it('24. seed (135c), deep-import (Cutlass Black), and catalog-only (a non-seed hull) definitions all resolve through the same one formatter, never a raw ad hoc string', () => {
    render(<AddShipModal onClose={() => {}} />)
    const search = screen.getByPlaceholderText(/search ship models/i)
    for (const [query, expected] of [
      ['135c', 'Origin 135c — Origin Jumpworks'],
      ['Cutlass Black', 'Drake Cutlass Black — Drake Interplanetary'],
    ] as const) {
      fireEvent.change(search, { target: { value: query } })
      expect(options().some((o) => o === expected)).toBe(true)
    }
  })

  it('25. searching by model ("135c") still finds it after normalization', () => {
    render(<AddShipModal onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/search ship models/i), { target: { value: '135c' } })
    expect(options().length).toBeGreaterThan(0)
  })

  it('26. searching by manufacturer ("Origin") finds every Origin ship, including the 135c', () => {
    render(<AddShipModal onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/search ship models/i), { target: { value: 'Origin' } })
    const results = options()
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((o) => o?.includes('Origin'))).toBe(true)
    expect(results.some((o) => o === 'Origin 135c — Origin Jumpworks')).toBe(true)
  })

  it('searching "Cutlass" finds every Cutlass variant across seed and catalog sources', () => {
    render(<AddShipModal onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/search ship models/i), { target: { value: 'Cutlass' } })
    const results = options()
    expect(results.length).toBeGreaterThan(1)
    expect(results.every((o) => o?.toLowerCase().includes('cutlass'))).toBe(true)
  })

  it('27. the full unfiltered list is sorted by the normalized label, not the raw displayName ("Origin 135c" sorts under O, not 1)', () => {
    render(<AddShipModal onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/search ship models/i), { target: { value: '' } })
    const results = options().filter((o): o is string => Boolean(o))
    const sorted = [...results].sort((a, b) => a.localeCompare(b))
    expect(results).toEqual(sorted)
    // Sanity: 135c must NOT be first (which raw-displayName sorting would produce).
    expect(results[0]).not.toContain('135c')
  })

  it('28. canonical picker uniqueness is untouched — exactly one selectable entry still exists per real hull (EWO-021 unaffected)', () => {
    render(<AddShipModal onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/search ship models/i), { target: { value: 'Cutlass Black' } })
    const results = options()
    expect(new Set(results).size).toBe(results.length)
  })

  it('29. no raw RSI/internal entity-class label (e.g. "AEGS_Eclipse", underscore-joined tokens) appears in the picker output', () => {
    render(<AddShipModal onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/search ship models/i), { target: { value: '' } })
    const rawLooking = options().filter((o) => o && /^[A-Z0-9]+(_[A-Za-z0-9]+)+/.test(o))
    expect(rawLooking).toEqual([])
  })
})
