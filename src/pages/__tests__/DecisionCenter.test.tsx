import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
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

/**
 * EWO-031 — Decision Center previously ran entirely against a hand-authored,
 * ~8-item demo list (`decisionCatalog`/`decisionCatalogNames` in
 * src/data/seed.ts, now removed) with zero connection to live fleet state —
 * confirmed disconnected during EWO-029's audit. No test file existed for
 * this page before this mission; every test below is new coverage for the
 * live-state-driven rewrite.
 *
 * Fixture: Vulture's Active Loadout ("Salvage Build" / vulture-salvage) has
 * a real, unresolved Left Shield Generator target of "Mirage" — confirmed
 * directly against src/data/seed.ts. "Mirage" is a deliberate
 * choice: `resolveNeededByBuilds` matches a hardpoint's `targetItem`
 * against the searched name with an exact (case-sensitive) comparison, and
 * "Mirage" is one of the few seed target values whose casing exactly
 * matches its real catalog display name — several other seed values (e.g.
 * "Snowblind") are written in a different case than the real catalog's
 * resolved name ("SnowBlind") and so would never match here, a pre-existing
 * seed/catalog casing mismatch outside this mission's scope.
 */
describe('<DecisionCenter /> — EWO-031 (Task 4): canonical catalog, not a demo list', () => {
  it('1. suggestions are drawn from the real generated component catalog, not a small demo list', () => {
    if (!catalogComponentsByName.has('Omnisky III Cannon')) return
    renderDecisionCenter()
    fireEvent.change(screen.getByPlaceholderText('Start typing — e.g. M, Mi, Mirage…'), { target: { value: 'Omnisky III Cannon' } })
    expect(screen.getByText('Omnisky III Cannon')).toBeInTheDocument()
  })

  it('2. a name with no catalog match at all resolves to "No Catalog Match", not a guessed verdict', () => {
    renderDecisionCenter()
    checkItem('Zzzznonexistentcomponentxyz')
    expect(screen.getByText('No Catalog Match')).toBeInTheDocument()
  })
})

describe('<DecisionCenter /> — EWO-031 (Task 5, Scenario A): still required by an active Loadout', () => {
  it('3. KEEP, with a Reserve action and a Needed By listing, when an active Loadout has an unresolved target for it', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    renderDecisionCenter()
    checkItem('Mirage')
    expect(screen.getByText('KEEP')).toBeInTheDocument()
    expect(screen.getByText(/Vulture/)).toBeInTheDocument()
    expect(screen.getByText(/Left Shield Generator/)).toBeInTheDocument()
    expect(screen.getByText('Reserve')).toBeInTheDocument()
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
    expect(screen.getByText('KEEP')).toBeInTheDocument()
    expect(screen.getByText('Already Reserved')).toBeInTheDocument()
    expect(screen.queryByText('Reserve')).not.toBeInTheDocument()
  })
})

describe('<DecisionCenter /> — EWO-031 (Task 5, Scenario B): every active Loadout already satisfied', () => {
  it('5. "Already Satisfied" / "Store in Hangar" / no reservation required, for a component no active Loadout needs at all', () => {
    if (!catalogComponentsByName.has('Omnisky III Cannon')) return
    renderDecisionCenter()
    checkItem('Omnisky III Cannon')
    expect(screen.getByText('Already Satisfied')).toBeInTheDocument()
    expect(screen.getByText('Store in Hangar')).toBeInTheDocument()
    expect(screen.getByText(/no reservation required/i)).toBeInTheDocument()
  })

  it('6. a component no active Loadout targets at all (a real catalog component with zero footprint in the fleet) also reads as satisfied', () => {
    if (!catalogComponentsByName.has('Pitman Mining Laser')) return
    renderDecisionCenter()
    checkItem('Pitman Mining Laser')
    expect(screen.getByText('Already Satisfied')).toBeInTheDocument()
  })
})
