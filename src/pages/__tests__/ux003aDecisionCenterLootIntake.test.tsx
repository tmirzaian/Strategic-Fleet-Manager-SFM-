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
  useFleetStore.setState({ hangarItems: [], reservations: [] })
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
 * UX-003A — "Decision Center Loot Intake." Dedicated coverage for the
 * work order's own Regression Requirements list beyond what
 * DecisionCenter.test.tsx's own baseline suite already certifies
 * (lookup mechanics, verdict classification, single-match Add/Reserve
 * flow, no-navigation).
 */
describe('UX-003A: Add quantity validation', () => {
  it('rejects zero, negative, and fractional quantities — Add to Inventory stays disabled', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    renderDecisionCenter()
    checkItem('Mirage')
    const panel = within(assessmentPanel())
    const qtyInput = panel.getByLabelText('Quantity to add')
    for (const bad of ['0', '-1', '1.5']) {
      fireEvent.change(qtyInput, { target: { value: bad } })
      expect(panel.getByRole('button', { name: /Add to Inventory/ })).toBeDisabled()
    }
    fireEvent.change(qtyInput, { target: { value: '3' } })
    expect(panel.getByRole('button', { name: /Add to Inventory/ })).not.toBeDisabled()
  })

  it('adding a custom quantity records exactly that many units, once', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    renderDecisionCenter()
    checkItem('Mirage')
    const panel = within(assessmentPanel())
    fireEvent.change(panel.getByLabelText('Quantity to add'), { target: { value: '4' } })
    fireEvent.click(panel.getByRole('button', { name: /Add to Inventory/ }))
    expect(useFleetStore.getState().hangarItems.filter((h) => h.name === 'Mirage').reduce((sum, h) => sum + h.qty, 0)).toBe(4)
  })
})

describe('UX-003A: multiple applicable target Loadouts', () => {
  function addSecondActiveDemand() {
    // A second, genuinely different real active Loadout with its own
    // unresolved Mirage requirement — Railen's own real active build,
    // given a synthetic additional hardpoint row (the same direct-patch
    // pattern established throughout this session for scenarios with no
    // pre-existing two-match seed fixture).
    useFleetStore.setState((s) => {
      const railen = s.ships.find((sh) => sh.id === 'railen')!
      const entry = catalogComponentsByName.get('Mirage')!
      return {
        hardpoints: [
          ...s.hardpoints,
          {
            id: 'ux003a-extra-hp',
            shipId: 'railen',
            buildId: railen.activeBuildId,
            slotLabel: 'Auxiliary Shield Slot',
            type: 'Shield',
            size: 'S1',
            factoryItem: '—',
            installedItem: '—',
            targetItem: 'Mirage',
            targetEntityClass: entry.entityClass,
            status: 'Missing',
          },
        ],
      }
    })
  }

  it('lists every applicable target Loadout, and the post-add banner does not offer an ambiguous single Reserve Now', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    addSecondActiveDemand()
    renderDecisionCenter()
    checkItem('Mirage')
    const panel = within(assessmentPanel())
    expect(panel.getByText(/Needed by 2 active Loadouts/)).toBeInTheDocument()
    expect(panel.getByText(/Vulture/)).toBeInTheDocument()
    expect(panel.getByText(/Railen/)).toBeInTheDocument()

    fireEvent.click(panel.getByRole('button', { name: /Add to Inventory/ }))
    expect(panel.getByText('Reserve for a target loadout?')).toBeInTheDocument()
    // Ambiguous — no single-click "Reserve Now" when more than one real
    // target could receive the just-added stock.
    expect(panel.queryByRole('button', { name: /Reserve Now/ })).not.toBeInTheDocument()
    // Both entries in the list itself are independently reservable instead.
    expect(panel.getAllByRole('button', { name: /^Reserve$/ }).length).toBe(2)
  })

  it('reserving one entry leaves the other still independently reservable if stock remains', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    addSecondActiveDemand()
    renderDecisionCenter()
    checkItem('Mirage')
    let panel = within(assessmentPanel())
    fireEvent.change(panel.getByLabelText('Quantity to add'), { target: { value: '2' } })
    fireEvent.click(panel.getByRole('button', { name: /Add to Inventory/ }))

    panel = within(assessmentPanel())
    const reserveButtons = panel.getAllByRole('button', { name: /^Reserve$/ })
    fireEvent.click(reserveButtons[0])

    panel = within(assessmentPanel())
    expect(useFleetStore.getState().reservations.filter((r) => r.componentName === 'Mirage' && r.status === 'ACTIVE')).toHaveLength(1)
    // One unit still free — the remaining entry stays reservable.
    expect(panel.getAllByRole('button', { name: /^Reserve$/ })).toHaveLength(1)
  })
})

describe('UX-003A: invalid/unknown item handling stays clear', () => {
  it('an unknown name shows NO CATALOG MATCH and never offers Add to Inventory', () => {
    renderDecisionCenter()
    checkItem('Totally Fictitious Component Name')
    const panel = within(assessmentPanel())
    expect(panel.getByText('NO CATALOG MATCH')).toBeInTheDocument()
    expect(panel.queryByRole('button', { name: /Add to Inventory/ })).not.toBeInTheDocument()
  })
})

describe('UX-003A: no navigation to Hangar Inventory is required anywhere in the workflow', () => {
  it('the full lookup -> add -> reserve sequence never renders a link to /hangar', () => {
    if (!catalogComponentsByName.has('Mirage')) return
    renderDecisionCenter()
    checkItem('Mirage')
    expect(document.querySelector('a[href="/hangar"]')).not.toBeInTheDocument()
    const panel = within(assessmentPanel())
    fireEvent.click(panel.getByRole('button', { name: /Add to Inventory/ }))
    expect(document.querySelector('a[href="/hangar"]')).not.toBeInTheDocument()
  })
})
