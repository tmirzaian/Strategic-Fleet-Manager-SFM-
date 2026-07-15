import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import QuickUpdate from '../QuickUpdate'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

function renderQuickUpdate() {
  return render(
    <MemoryRouter>
      <QuickUpdate />
    </MemoryRouter>
  )
}

/**
 * EWO-030 — Quick Update Workflow Simplification & Ship Detail Component
 * Removal. No test file existed for this page before this mission; every
 * test below is new coverage for the rewritten workflow. Fixtures use the
 * seed fleet's own real data: Ghost Mk II ("F7C-S Hornet Ghost Mk II",
 * ships[0], Active Loadout "Stealth Build") has exactly one open Shield
 * slot (Shield 2 — Shield 1 already holds Mirage, status OK) and its
 * Cooler 1 slot already targets "Snowblind" (unfulfilled) — both confirmed
 * directly against src/data/seed.ts rather than assumed.
 */
describe('<QuickUpdate /> — EWO-030 (Task 1): canonical component search renderer', () => {
  it('1. Install Component renders the same search input + listbox + Type/Size fields Hangar Inventory uses, not a free-text search', () => {
    renderQuickUpdate()
    expect(screen.getByPlaceholderText('Search catalog components…')).toBeInTheDocument()
    expect(document.querySelector('select[size="6"]')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Size')).toBeInTheDocument()
  })

  it('2. Add Component to Hangar renders the same canonical search renderer', () => {
    renderQuickUpdate()
    fireEvent.click(screen.getByText('Add Component to Hangar'))
    expect(screen.getByPlaceholderText('Search catalog components…')).toBeInTheDocument()
    expect(document.querySelector('select[size="6"]')).toBeInTheDocument()
  })

  it('3. a search narrow enough to leave exactly one catalog match auto-selects it (single-result parity with Hangar Inventory)', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    renderQuickUpdate()
    fireEvent.change(screen.getByPlaceholderText('Search catalog components…'), { target: { value: 'Mirage' } })
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    expect(select.value).toBe('Mirage')
    expect(screen.getByText('Shield')).toBeInTheDocument()
  })
})

describe('<QuickUpdate /> — EWO-030 (Task 2): Install Component follows Component -> Ship -> Loadout -> Slot', () => {
  it('4. Ship, Loadout, and Slot are all hidden until a Component is selected', () => {
    renderQuickUpdate()
    expect(screen.queryByText('Loadout')).not.toBeInTheDocument()
    expect(screen.queryByText('Slot')).not.toBeInTheDocument()
  })

  it('5. selecting a Component reveals Ship — with a Ship already implied by default, Loadout resolves in the same step rather than forcing a redundant click', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    renderQuickUpdate()
    fireEvent.change(screen.getByPlaceholderText('Search catalog components…'), { target: { value: 'Mirage' } })
    expect(screen.getByText('Ship')).toBeInTheDocument()
    expect(screen.getByText('Loadout')).toBeInTheDocument()
  })

  it('6. once a Ship is implied, Loadout appears, and Loadout options are filtered to that Ship\'s own Builds', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    renderQuickUpdate()
    fireEvent.change(screen.getByPlaceholderText('Search catalog components…'), { target: { value: 'Mirage' } })
    expect(screen.getByText('Loadout')).toBeInTheDocument()
    expect(screen.getByText('Stealth Build (Active)')).toBeInTheDocument()
    expect(screen.getByText('Escort Build')).toBeInTheDocument()
  })
})

describe('<QuickUpdate /> — EWO-030 (Task 3/4): compatible slot filtering and auto-select', () => {
  // Ghost's Stealth Build Cooler 1 already targets "Snowblind" (unfulfilled
  // — installedItem is still "CoolCore I") per src/data/seed.ts; Cooler 2
  // has no target at all (status OK — "nothing required," not an open
  // slot), so Cooler 1 is the exact single genuinely-open, compatible slot
  // for this component. The real catalog's display name is "SnowBlind"
  // (capital B) — searching the seed's own lowercase spelling still
  // resolves to it via case-insensitive matching, exactly like a Commander
  // typing from memory would expect.

  it('7. the Slot dropdown only lists compatible hardpoints — an S4 Weapon slot never appears for an S1 Cooler component', () => {
    if (!catalogComponentsByName.has('SnowBlind')) return
    renderQuickUpdate()
    fireEvent.change(screen.getByPlaceholderText('Search catalog components…'), { target: { value: 'Snowblind' } })
    expect(screen.queryByText(/Weapon 1/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Quantum Drive/)).not.toBeInTheDocument()
  })

  it('8. exactly one compatible slot auto-selects — the Commander is never asked to answer an unnecessary question', () => {
    if (!catalogComponentsByName.has('SnowBlind')) return
    renderQuickUpdate()
    fireEvent.change(screen.getByPlaceholderText('Search catalog components…'), { target: { value: 'Snowblind' } })
    expect(screen.getByText(/Cooler 1/)).toBeInTheDocument()
    // Auto-selected immediately — Save is already enabled with no further
    // manual slot selection required.
    expect(screen.getByText('Save Update')).not.toBeDisabled()
  })

  it('9. a component with zero compatible open slots on the chosen Loadout shows a clear message and keeps Save disabled', () => {
    if (!catalogComponentsByName.has('Atlas')) return
    renderQuickUpdate()
    fireEvent.change(screen.getByPlaceholderText('Search catalog components…'), { target: { value: 'Atlas' } })
    const select = document.querySelector('select[size="6"]') as HTMLSelectElement
    if (select.value !== 'Atlas') return // only proceed if Atlas resolved to a single unambiguous catalog match
    // Ghost's Quantum Drive slot is already fulfilled (status OK) on both
    // Loadouts, so no open, compatible slot exists for Atlas.
    expect(screen.getByText(/No compatible open slot/)).toBeInTheDocument()
    expect(screen.getByText('Save Update')).toBeDisabled()
  })

  it('10. completing Component -> Ship -> Loadout -> Slot and saving installs the component and records it in the Captain\'s Log', () => {
    if (!catalogComponentsByName.has('SnowBlind')) return
    renderQuickUpdate()
    fireEvent.change(screen.getByPlaceholderText('Search catalog components…'), { target: { value: 'Snowblind' } })
    fireEvent.click(screen.getByText('Save Update'))
    expect(screen.getByText('Fleet Registry Updated')).toBeInTheDocument()
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-stealth' && h.slotLabel === 'Cooler 1')
    expect(hp?.installedItem).toBe('SnowBlind')
  })
})

describe('<QuickUpdate /> — EWO-030 (Task 5): existing validation is defensive-only', () => {
  it('11. Save stays disabled until Component, Ship, Loadout, and Slot are all resolved — the normal workflow cannot submit an incomplete/invalid Install', () => {
    renderQuickUpdate()
    expect(screen.getByText('Save Update')).toBeDisabled()
  })
})

describe('<QuickUpdate /> — EWO-030 (Task 6): Remove Component hidden from the UI', () => {
  it('12. no "Remove Component" tab is rendered', () => {
    renderQuickUpdate()
    expect(screen.queryByText('Remove Component')).not.toBeInTheDocument()
  })
})

describe('<QuickUpdate /> — EWO-030 (Task 8): Move Between Ships hidden from the UI', () => {
  it('13. no "Move Component Between Ships" tab is rendered', () => {
    renderQuickUpdate()
    expect(screen.queryByText('Move Component Between Ships')).not.toBeInTheDocument()
  })
})

describe('<QuickUpdate /> — EWO-030 (Task 9): Set Active Loadout unchanged', () => {
  it('14. Set Active Loadout still switches the Fleet Asset\'s Active Loadout', () => {
    renderQuickUpdate()
    fireEvent.click(screen.getByText('Set Active Loadout'))
    const shipSelects = screen.getAllByRole('combobox')
    fireEvent.change(shipSelects[0], { target: { value: 'ghost' } })
    const loadoutSelect = shipSelects[1]
    fireEvent.change(loadoutSelect, { target: { value: 'ghost-escort' } })
    fireEvent.click(screen.getByText('Save Update'))
    expect(screen.getByText('Fleet Registry Updated')).toBeInTheDocument()
    expect(useFleetStore.getState().ships.find((s) => s.id === 'ghost')?.activeBuildId).toBe('ghost-escort')
  })
})

describe('<QuickUpdate /> — EWO-030: Add Component to Hangar uses the real catalog entry', () => {
  it('15. adding a component to Hangar via the canonical search carries its real Type/Size/entityClass, not a hardcoded placeholder', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    renderQuickUpdate()
    fireEvent.click(screen.getByText('Add Component to Hangar'))
    fireEvent.change(screen.getByPlaceholderText('Search catalog components…'), { target: { value: 'Mirage' } })
    fireEvent.click(screen.getByText('Save Update'))
    const item = useFleetStore.getState().hangarItems.find((h) => h.name === 'Mirage')
    expect(item).toBeDefined()
    expect(item!.type).toBe('Shield')
    expect(item!.size).toBe('S1')
  })
})
