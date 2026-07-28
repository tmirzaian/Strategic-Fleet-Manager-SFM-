import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import TargetComponentPicker from '../TargetComponentPicker'

afterEach(() => cleanup())

const options = [
  { path: 'Power → Regulus', item: 'Regulus' },
  { path: 'Power → DayBreak', item: 'DayBreak' },
  { path: 'Shield → AllStop', item: 'AllStop' },
  { path: 'Shield → Mirage', item: 'Mirage' },
]

describe('EWO-023 (Task 1): TargetComponentPicker', () => {
  it('1. the option list is not present in the DOM until opened', () => {
    render(<TargetComponentPicker id="t1" value="Regulus" onChange={() => {}} options={options} />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('2. clicking the input opens the option list, showing every option', () => {
    render(<TargetComponentPicker id="t1" value="Regulus" onChange={() => {}} options={options} />)
    fireEvent.click(screen.getByRole('combobox'))
    const listbox = screen.getByRole('listbox')
    expect(listbox).toBeInTheDocument()
    expect(screen.getByText('DayBreak')).toBeInTheDocument()
    expect(screen.getByText('AllStop')).toBeInTheDocument()
  })

  it('3. typing filters the option list to matching components only', () => {
    render(<TargetComponentPicker id="t1" value="Regulus" onChange={() => {}} options={options} />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'All' } })
    expect(screen.getByText('AllStop')).toBeInTheDocument()
    expect(screen.queryByText('DayBreak')).not.toBeInTheDocument()
  })

  it('4. clicking an option commits the value, calls onChange, and closes the list', () => {
    const onChange = vi.fn()
    render(<TargetComponentPicker id="t1" value="Regulus" onChange={onChange} options={options} />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText('DayBreak'))
    // EWO-STAB-004B — onChange's second argument is the option's own
    // entityClass, undefined here since this fixture's options carry none.
    expect(onChange).toHaveBeenCalledWith('DayBreak', undefined)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('19. clicking an option with a known entityClass passes it through to onChange', () => {
    const onChange = vi.fn()
    const optionsWithEntityClass = [...options, { path: 'Turret → M2C "Swarm"', item: 'M2C "Swarm"', entityClass: 'Turret_PDC_BEHR_A' }]
    render(<TargetComponentPicker id="t1" value="" onChange={onChange} options={optionsWithEntityClass} />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByText('M2C "Swarm"'))
    expect(onChange).toHaveBeenCalledWith('M2C "Swarm"', 'Turret_PDC_BEHR_A')
  })

  it('5. no matching component shows a clear "no match" row rather than an empty list, and free text is still accepted', () => {
    const onChange = vi.fn()
    render(<TargetComponentPicker id="t1" value="" onChange={onChange} options={options} />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Totally Custom Part' } })
    expect(screen.getByText(/no matching component/i)).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
    // No matching option to commit via Enter (filtered list is empty) — the
    // free-text value stays in the editable field for the Commander to keep typing or accept elsewhere.
    expect(screen.getByRole('combobox')).toHaveValue('Totally Custom Part')
  })

  it('6. pressing Escape reverts to the last committed value and closes the list', () => {
    render(<TargetComponentPicker id="t1" value="Regulus" onChange={() => {}} options={options} />)
    const input = screen.getByRole('combobox')
    fireEvent.click(input)
    fireEvent.change(input, { target: { value: 'zzz' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveValue('Regulus')
  })

  it('7. only ever renders a bounded number of options, never the entire catalog at once (performance)', () => {
    const manyOptions = Array.from({ length: 900 }, (_, i) => ({ item: `Component ${i}`, path: `Cat → Component ${i}` }))
    render(<TargetComponentPicker id="t1" value="" onChange={() => {}} options={manyOptions} />)
    fireEvent.click(screen.getByRole('combobox'))
    const renderedOptions = screen.getByRole('listbox').querySelectorAll('button')
    expect(renderedOptions.length).toBeLessThan(50)
  })
})

describe('EWO-026 (Task 7/13): TargetComponentPicker option presentation — Grade reachability regression', () => {
  it('18. DayBreak (a component actually assigned on a deep-imported ship) keeps showing its Grade', () => {
    render(<TargetComponentPicker id="t1" value="" onChange={() => {}} options={options} />)
    fireEvent.click(screen.getByRole('combobox'))
    // Real generated-data (CAT-001): DayBreak's Classification is
    // "Civilian", grade 3 -> letter C -> "Civilian C" — scoped to
    // DayBreak's own option row, since another unrelated option may
    // coincidentally share the same grade letter.
    const dayBreakOption = screen.getByText('DayBreak').closest('button')!
    expect(dayBreakOption).toHaveTextContent('Civilian C')
  })

  it('17/19. a catalog-only component with no per-ship deep-import instance (Bolide) now resolves its real Grade too — the EWO-026 root-cause fix (previously name-only, not because Grade was genuinely absent)', () => {
    const catalogOnlyOptions = [
      { path: 'Power → Bolide', item: 'Bolide' },
      { path: 'Power → Cirrus', item: 'Cirrus' },
    ]
    render(<TargetComponentPicker id="t2" value="" onChange={() => {}} options={catalogOnlyOptions} />)
    fireEvent.click(screen.getByRole('combobox'))
    // Real generated-data (CAT-001): Bolide=Military/grade 2 -> "Military
    // B", Cirrus=Stealth/grade 3 -> "Stealth C" — both use the exact same
    // presentation formatter as the static Factory/Installed/Target
    // columns (resolveComponentLabel), never a second, inconsistent
    // option-only model.
    expect(screen.getByText('Bolide').closest('button')).toHaveTextContent('Military B')
    expect(screen.getByText('Cirrus').closest('button')).toHaveTextContent('Stealth C')
  })
})

describe('EWO-069 (Part F): optional full-value tooltip', () => {
  it('renders the given title on the combobox input, for callers whose surrounding cell may clip a long selected value', () => {
    render(<TargetComponentPicker id="t3" value="An Unusually Long Selected Component Name" onChange={() => {}} options={options} title="An Unusually Long Selected Component Name" />)
    expect(screen.getByRole('combobox')).toHaveAttribute('title', 'An Unusually Long Selected Component Name')
  })

  it('omitting title (every pre-existing caller) renders no title attribute at all — additive only', () => {
    render(<TargetComponentPicker id="t4" value="DayBreak" onChange={() => {}} options={options} />)
    expect(screen.getByRole('combobox')).not.toHaveAttribute('title')
  })
})
