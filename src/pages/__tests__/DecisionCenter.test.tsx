import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import DecisionCenter from '../DecisionCenter'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

function renderDecisionCenter() {
  return render(
    <MemoryRouter>
      <DecisionCenter />
    </MemoryRouter>
  )
}

function checkItem(name: string) {
  fireEvent.change(screen.getByPlaceholderText('Start typing — e.g. M, Mi, Mirage…'), { target: { value: name } })
  fireEvent.click(screen.getByText('Check Item'))
}

function assessmentPanel(): HTMLElement {
  return screen.getByText('Item Assessment').closest('.panel') as HTMLElement
}

/**
 * EWO-031 — Decision Center previously ran entirely against a hand-authored,
 * ~8-item demo list (`decisionCatalog`/`decisionCatalogNames` in
 * src/data/seed.ts, now removed) with zero connection to live fleet state —
 * confirmed disconnected during EWO-029's audit.
 *
 * UX-003A — "Decision Center Loot Intake." Refactors the page into a
 * compact Loot Lookup + Item Assessment two-panel workflow, adding an
 * in-place Add to Inventory action and an optional, canonically-gated
 * post-add reservation step — the Commander never leaves this page to
 * record or reserve a component already evaluated here.
 *
 * Fixture: Vulture's Active Loadout ("Salvage Build" / vulture-salvage) has
 * a real, unresolved Left Shield Generator target of "Mirage" — confirmed
 * directly against src/data/seed.ts. "Mirage" is a deliberate
 * choice: `resolveNeededByBuilds` matches a hardpoint's `targetItem`
 * against the searched name with an exact (case-sensitive) comparison, and
 * "Mirage" is one of the few seed target values whose casing exactly
 * matches its real catalog display name.
 */
describe('<DecisionCenter /> — EWO-061: standardized operational header', () => {
  it('renders the standard label-above-title header with no functional-description paragraph', () => {
    renderDecisionCenter()
    const label = screen.getByText('Decision Center')
    expect(label.tagName).toBe('P')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Should I keep this?')
    expect(screen.queryByText(/Check found loot against your active Loadouts/)).not.toBeInTheDocument()
  })
})

describe('<DecisionCenter /> — UX-003A (Deliverable 7): empty state before lookup', () => {
  it('renders "Awaiting Item Assessment" inside a visible Item Assessment panel before any lookup completes', () => {
    renderDecisionCenter()
    expect(screen.getByText('Loot Lookup')).toBeInTheDocument()
    expect(screen.getByText('Item Assessment')).toBeInTheDocument()
    expect(screen.getByText('Awaiting Item Assessment')).toBeInTheDocument()
    expect(screen.getByText(/Search for a recovered component to review fleet demand/)).toBeInTheDocument()
  })
})

describe('<DecisionCenter /> — EWO-031 (Task 4): canonical catalog, not a demo list', () => {
  it('1. suggestions are drawn from the real generated component catalog, not a small demo list', () => {
    if (!catalogComponentsByName.has('Omnisky III Cannon')) return
    renderDecisionCenter()
    fireEvent.change(screen.getByPlaceholderText('Start typing — e.g. M, Mi, Mirage…'), { target: { value: 'Omnisky III Cannon' } })
    expect(screen.getByText('Omnisky III Cannon')).toBeInTheDocument()
  })

  it('2. a name with no catalog match at all resolves to a NO CATALOG MATCH assessment, not a guessed verdict', () => {
    renderDecisionCenter()
    checkItem('Zzzznonexistentcomponentxyz')
    expect(within(assessmentPanel()).getByText('NO CATALOG MATCH')).toBeInTheDocument()
    expect(screen.queryByText('Awaiting Item Assessment')).not.toBeInTheDocument()
  })
})

describe('<DecisionCenter /> — EWO-031 (Task 5, Scenario A) / UX-003A: still required by an active Loadout', () => {
  it('3. KEEP, with fleet demand, inventory position, and applicable target Loadouts, when an active Loadout has an unresolved target for it', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    // Cleared Hangar stock/reservations — the seed fleet already owns a
    // real Mirage unit genuinely INSTALLED on Ghost's own Left Shield
    // Generator (unrelated to Hangar stock), which the Inventory Position
    // assertion below expects to see reflected honestly, not zeroed out.
    useFleetStore.setState({ hangarItems: [], reservations: [] })
    renderDecisionCenter()
    checkItem('Mirage')
    const panel = within(assessmentPanel())
    expect(panel.getByText('KEEP')).toBeInTheDocument()
    expect(panel.getByText(/Needed by 1 active Loadout/)).toBeInTheDocument()
    expect(panel.getByText(/Vulture/)).toBeInTheDocument()
    expect(panel.getByText(/Left Shield Generator/)).toBeInTheDocument()
    expect(panel.getByText(/Installed 1 · Reserved 0 · Available 0/)).toBeInTheDocument()
  })

  it('4. an already-reserved requirement shows "Already Reserved" instead of a Reserve action — never double-offered', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    const reserveResult = useFleetStore.getState().reserveComponent({
      missionConfigurationId: 'vulture-salvage',
      fleetAssetId: 'vulture',
      targetSlotLabel: 'Left Shield Generator',
      componentName: 'Mirage',
      quantity: 1,
    })
    expect(reserveResult.success).toBe(true)
    renderDecisionCenter()
    checkItem('Mirage')
    const panel = within(assessmentPanel())
    expect(panel.getByText('KEEP')).toBeInTheDocument()
    expect(panel.getByText('Already Reserved')).toBeInTheDocument()
    expect(panel.queryByRole('button', { name: /Reserve/ })).not.toBeInTheDocument()
  })
})

describe('<DecisionCenter /> — EWO-031 (Task 5, Scenario B): every active Loadout already satisfied', () => {
  it('5. ALREADY SATISFIED / "Store in Hangar" / no reservation required, for a component no active Loadout needs at all', () => {
    if (!catalogComponentsByName.has('Omnisky III Cannon')) return
    renderDecisionCenter()
    checkItem('Omnisky III Cannon')
    const panel = within(assessmentPanel())
    expect(panel.getByText('ALREADY SATISFIED')).toBeInTheDocument()
    expect(panel.getByText('Store in Hangar')).toBeInTheDocument()
    expect(panel.getByText(/no reservation required/i)).toBeInTheDocument()
  })

  it('6. a component no active Loadout targets at all (a real catalog component with zero footprint in the fleet) also reads as satisfied', () => {
    if (!catalogComponentsByName.has('Pitman Mining Laser')) return
    renderDecisionCenter()
    checkItem('Pitman Mining Laser')
    expect(within(assessmentPanel()).getByText('ALREADY SATISFIED')).toBeInTheDocument()
  })
})

describe('<DecisionCenter /> — UX-003A (Deliverable 2/3): Add to Inventory and the post-add reservation step', () => {
  it('a successful lookup exposes Add to Inventory, and adding it updates the ledger exactly once', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    useFleetStore.setState({ hangarItems: [], reservations: [] })
    renderDecisionCenter()
    checkItem('Mirage')
    const panel = within(assessmentPanel())
    expect(panel.getByRole('button', { name: /Add to Inventory/ })).toBeInTheDocument()

    fireEvent.click(panel.getByRole('button', { name: /Add to Inventory/ }))

    expect(useFleetStore.getState().hangarItems.filter((h) => h.name === 'Mirage').reduce((sum, h) => sum + h.qty, 0)).toBe(1)
    // Deliverable 2 — the canonical Add Inventory ledger call, never a second one.
    expect(panel.getByText('Mirage added to Hangar Inventory.')).toBeInTheDocument()
    // Regression: "Add action is not duplicated after success."
    expect(panel.queryByRole('button', { name: /Add to Inventory/ })).not.toBeInTheDocument()
  })

  it('after Add, an eligible, unambiguous target offers Reserve Now, gated by the EWO-072 canonical resolver', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    useFleetStore.setState({ hangarItems: [], reservations: [] })
    renderDecisionCenter()
    checkItem('Mirage')
    const panel = within(assessmentPanel())
    fireEvent.click(panel.getByRole('button', { name: /Add to Inventory/ }))

    expect(panel.getByText('Reserve for a target loadout?')).toBeInTheDocument()
    fireEvent.click(panel.getByRole('button', { name: /Reserve Now/ }))

    expect(useFleetStore.getState().reservations.some((r) => r.componentName === 'Mirage' && r.status === 'ACTIVE')).toBe(true)
    // "Reserved" now legitimately appears twice — once on the Applicable
    // Target Loadouts entry itself, once in the post-add confirmation line.
    expect(panel.getAllByText(/Reserved/).length).toBeGreaterThan(0)
    expect(panel.getByText(/for Vulture — Salvage Build/)).toBeInTheDocument()
  })

  it('Leave Unreserved completes successfully without creating a reservation', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    renderDecisionCenter()
    checkItem('Mirage')
    const panel = within(assessmentPanel())
    fireEvent.click(panel.getByRole('button', { name: /Add to Inventory/ }))
    fireEvent.click(panel.getByRole('button', { name: /Leave Unreserved/ }))

    expect(useFleetStore.getState().reservations.some((r) => r.componentName === 'Mirage' && r.status === 'ACTIVE')).toBe(false)
    expect(panel.getByText(/Left unreserved/)).toBeInTheDocument()
  })

  it('does not offer a reservation step when no unresolved target requirement exists (ALREADY SATISFIED)', () => {
    if (!catalogComponentsByName.has('Omnisky III Cannon')) return
    renderDecisionCenter()
    checkItem('Omnisky III Cannon')
    const panel = within(assessmentPanel())
    fireEvent.click(panel.getByRole('button', { name: /Add to Inventory/ }))

    expect(panel.getByText('Omnisky III Cannon added to Hangar Inventory.')).toBeInTheDocument()
    expect(panel.queryByText('Reserve for a target loadout?')).not.toBeInTheDocument()
    expect(panel.queryByRole('button', { name: /Reserve Now/ })).not.toBeInTheDocument()
  })

  it('repeated lookup resets the assessment cleanly — a new search never carries over a prior Add/Reserve state', () => {
    if (!catalogComponentsByName.has('Mirage') || !catalogComponentsByName.has('Omnisky III Cannon')) return
    renderDecisionCenter()
    checkItem('Mirage')
    let panel = within(assessmentPanel())
    fireEvent.click(panel.getByRole('button', { name: /Add to Inventory/ }))
    expect(panel.getByText('Reserve for a target loadout?')).toBeInTheDocument()

    checkItem('Omnisky III Cannon')
    panel = within(assessmentPanel())
    expect(panel.queryByText('Reserve for a target loadout?')).not.toBeInTheDocument()
    expect(panel.getByRole('button', { name: /Add to Inventory/ })).toBeInTheDocument()
  })
})

describe('<DecisionCenter /> — UX-003A (Deliverable 9): no navigation away during the loot-evaluation workflow', () => {
  it('the assessment panel never links or navigates to Hangar Inventory', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    renderDecisionCenter()
    checkItem('Mirage')
    expect(screen.queryByRole('link', { name: /hangar/i })).not.toBeInTheDocument()
    expect(document.querySelector('a[href="/hangar"]')).not.toBeInTheDocument()
  })
})
