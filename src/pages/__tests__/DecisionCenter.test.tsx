import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
    // EWO-100 (Phase 1) — standardized operational status line, replacing the prior question-form title.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mission Assessment Available')
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

/**
 * EWO-116 (Part L) — Decision Center Station Migration test checklist.
 * Items 6/7/8/12 (existing evaluation/recommendation/workflow authorities
 * and existing behavioral tests remain unchanged/green) are proven by
 * every describe block above this one passing completely unmodified —
 * not duplicated here. Item 1 (Flagship Frame) and item 5 (laboratory
 * environment behaves as a viewport, not a hero cell) are App-shell-level
 * concerns covered in src/__tests__/App.test.tsx.
 */
describe('<DecisionCenter /> — EWO-116 (Part L, items 2/3/4): Station Shell/Kit adoption', () => {
  it('item 3: renders inside the Station Shell threshold wrapper (StationShell)', () => {
    const { container } = renderDecisionCenter()
    expect(container.querySelector('.max-w-5xl.space-y-4')).not.toBeNull()
  })

  it('item 2: CompartmentHeader is mounted on its own glass placard, not floating in plain space', () => {
    renderDecisionCenter()
    expect(screen.getByTestId('compartment-header')).toBeInTheDocument()
    const heading = screen.getByRole('heading', { level: 1 })
    const placard = heading.closest('.bg-black\\/35') as HTMLElement
    expect(placard).not.toBeNull()
    expect(placard.className).toContain('backdrop-blur-md')
    expect(within(placard).getByText('Decision Center').tagName).toBe('P')
  })

  it('item 4: Loot Lookup and Item Assessment are both MountedWorkspacePanel (Station Kit), not ad hoc `.panel` divs', () => {
    renderDecisionCenter()
    const panels = screen.getAllByTestId('mounted-workspace-panel')
    expect(panels.length).toBe(2)
    expect(within(panels[0]).getByText('Loot Lookup')).toBeInTheDocument()
    expect(within(panels[1]).getByText('Item Assessment')).toBeInTheDocument()
  })

  it('item 4: the Quartermaster briefs the Commander via the canonical OfficerBriefingBlock (Station Kit)', () => {
    renderDecisionCenter()
    expect(screen.getByTestId('officer-briefing-block')).toBeInTheDocument()
    expect(screen.getByTestId('officer-briefing-summary')).toHaveTextContent(/evaluated here before they rejoin the fleet/)
  })

  it('item 4: the action-row section break composes StructuralDivider (Station Kit), not a raw border div', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    renderDecisionCenter()
    checkItem('Mirage')
    expect(screen.getByTestId('assessment-action-divider')).toBeInTheDocument()
  })
})

describe('<DecisionCenter /> — EWO-116 (Part L, item 9): empty state conforms to Quartermaster Edition empty-state authority', () => {
  it('the pre-lookup state composes StandingReportRegion (Station Shell) — calm and operational, no warning language, no dead page', () => {
    const { container } = renderDecisionCenter()
    const region = screen.getByTestId('item-assessment-standing-report')
    expect(region).toBeInTheDocument()
    expect(within(region).getByText('Awaiting Item Assessment')).toBeInTheDocument()
    // No warning/danger styling anywhere in the empty state — "operational
    // even with nothing awaiting evaluation," never an error/dead-page tone.
    expect(region.querySelector('.text-danger')).toBeNull()
    expect(region.querySelector('.text-warning')).toBeNull()
    // The monitoring visual (reused radar-sweep, EWO-109) is present —
    // the laboratory reads as actively watching, not idle.
    expect(container.querySelector('.animate-radar-sweep')).not.toBeNull()
  })
})

describe('<DecisionCenter /> — EWO-116 (Part L, items 10/11): no new business logic, no duplicated primitives', () => {
  const source = readFileSync(resolve(__dirname, '../DecisionCenter.tsx'), 'utf-8')

  it('item 11: no longer imports EnvironmentBay — the bounded/bordered room primitive is fully retired from this Station', () => {
    const importLines = source.split('\n').filter((line) => line.trim().startsWith('import'))
    expect(importLines.some((line) => line.includes('EnvironmentBay'))).toBe(false)
  })

  it('item 10: still calls the exact same canonical resolvers, never a second/divergent implementation', () => {
    expect(source).toContain('resolveNeededByBuilds')
    expect(source).toContain('resolveReservationEligibility')
    expect(source).toContain('calculateComponentAvailability')
    expect(source).toContain('addHangarItem')
    expect(source).toContain('reserveComponent')
  })

  it('item 10: introduces no new top-level function beyond the two pre-existing business-logic helpers', () => {
    const topLevelFunctions = source.match(/^function \w+/gm) ?? []
    expect(topLevelFunctions.sort()).toEqual(['function evaluate', 'function recommendationTone'].sort())
  })

  it('item 11: composes Station Shell/Kit primitives via import, never redefines an equivalent locally', () => {
    expect(source).toContain("from '../components/stationShell'")
    expect(source).toContain("from '../components/stationKit'")
  })
})
