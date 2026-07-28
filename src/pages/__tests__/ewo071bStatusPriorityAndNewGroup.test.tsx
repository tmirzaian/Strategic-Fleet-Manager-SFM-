import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'
import type { Hardpoint, HangarItem, MissionReservation } from '../../types'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
  // @ts-expect-error — test-only global stub, not a real IntersectionObserver
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => cleanup())

function renderWorkspace(shipId: string) {
  return render(
    <MemoryRouter initialEntries={[`/ship-workspace/${shipId}`]}>
      <Routes>
        <Route path="/ship-workspace/:shipId" element={<ShipWorkspacePrototype />} />
      </Routes>
    </MemoryRouter>
  )
}

function getPortRow(slotLabel: string): HTMLElement {
  const matches = screen.getAllByText(slotLabel)
  const rowLabel = matches.find((el) => el.closest('tr') !== null)
  if (!rowLabel) throw new Error(`No port row found for "${slotLabel}"`)
  return rowLabel.closest('tr') as HTMLElement
}

function expandInstall(slotLabel: string): HTMLElement {
  const row = getPortRow(slotLabel)
  const installButton = Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.includes('Install / Change'))!
  fireEvent.click(installButton)
  return row.nextElementSibling as HTMLElement
}

function patchHardpoint(buildId: string, slotLabel: string, patch: Partial<Hardpoint>) {
  useFleetStore.setState((s) => ({
    hardpoints: s.hardpoints.map((h) => (h.buildId === buildId && h.slotLabel === slotLabel ? { ...h, ...patch } : h)),
  }))
}

const SLOT = 'Right Shield Generator'
const ALT_TARGET = 'FR-66'
const UPGRADE_CANDIDATE = 'Mirage'
const BORROW_CANDIDATE = 'Veil'

/**
 * EWO-071B — "Candidate Hierarchy Enforcement & Acquisition Action
 * Promotion." Part A: the Status column must agree with the
 * highest-priority fulfillment path the disclosure is already showing —
 * verified here at the full page/integration level (the unit-level fix
 * itself is in componentAcquisitionHint.test.ts). Part E: the final
 * disclosure order is RESERVED > UPGRADE > NEW > BORROW? (or
 * AVAILABLE > UPGRADE > NEW > BORROW? when nothing is reserved).
 */
describe('EWO-071B (Part A): Status column agrees with the disclosure\'s own highest-priority group', () => {
  it('Status reads RESERVED, never AVAILABLE, when a Reserved candidate exists — even with additional free stock also present', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(ALT_TARGET)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    // Real Target changes go through saveMissionConfiguration, which also
    // recomputes hp.status; this direct patch mirrors that by setting
    // both — a stale hp.status left over from the factory default ('OK')
    // would short-circuit resolveOperationalReviewStatus before it ever
    // consults the hint this test exists to verify.
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: entry.entityClass, status: 'Missing' })
    useFleetStore.setState({
      hangarItems: [{ id: 'h1', name: ALT_TARGET, type: entry.category, size: `S${entry.size}`, qty: 2, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
      reservations: [
        {
          id: 'res-1',
          missionConfigurationId: ship.activeBuildId,
          fleetAssetId: 'ghost',
          targetSlotLabel: SLOT,
          componentName: ALT_TARGET,
          componentEntityClass: entry.entityClass,
          quantity: 1,
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        } as MissionReservation,
      ],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const row = getPortRow(SLOT)
    // The compact Status pill in the main row (not the expanded disclosure).
    expect(within(row).getByText('RESERVED')).toBeInTheDocument()
    expect(within(row).queryByText('AVAILABLE')).not.toBeInTheDocument()

    const disclosure = within(expandInstall(SLOT))
    expect(disclosure.getByText('RESERVED')).toBeInTheDocument()
    expect(disclosure.queryByText('AVAILABLE')).not.toBeInTheDocument()
  })

  it('Status reads AVAILABLE when the Target is genuinely free with no reservation at all', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(ALT_TARGET)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: entry.entityClass, status: 'Missing' })
    useFleetStore.setState({
      hangarItems: [{ id: 'h2', name: ALT_TARGET, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const row = getPortRow(SLOT)
    // The Status column appends the owned quantity for this tier (e.g.
    // "1 AVAILABLE") — same established pattern as Manage Loadout's own
    // Status column.
    expect(within(row).getByText('1 AVAILABLE')).toBeInTheDocument()
  })
})

describe('EWO-071B (Part E): final disclosure order', () => {
  it('RESERVED > UPGRADE > NEW > BORROW? when the Target is reserved', () => {
    if (catalogComponentsByName.size === 0) return
    const targetEntry = catalogComponentsByName.get(ALT_TARGET)!
    const upgradeEntry = catalogComponentsByName.get(UPGRADE_CANDIDATE)!
    const donorEntry = catalogComponentsByName.get(BORROW_CANDIDATE)!
    const corsair = useFleetStore.getState().ships.find((s) => s.id === 'corsair')!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    const donorSlotLabel = 'A Shield Generator'
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: targetEntry.entityClass })
    useFleetStore.setState((s) => ({
      hangarItems: [
        { id: 'r1', name: ALT_TARGET, type: targetEntry.category, size: `S${targetEntry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: targetEntry.entityClass } as HangarItem,
        { id: 'u1', name: UPGRADE_CANDIDATE, type: upgradeEntry.category, size: `S${upgradeEntry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: upgradeEntry.entityClass } as HangarItem,
      ],
      reservations: [
        {
          id: 'res-own',
          missionConfigurationId: ship.activeBuildId,
          fleetAssetId: 'ghost',
          targetSlotLabel: SLOT,
          componentName: ALT_TARGET,
          componentEntityClass: targetEntry.entityClass,
          quantity: 1,
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        } as MissionReservation,
      ],
      installedLoadouts: [{ shipId: 'corsair', slotLabel: donorSlotLabel, installedItem: BORROW_CANDIDATE, entityClass: donorEntry.entityClass }],
      hardpoints: s.hardpoints.map((h) =>
        h.buildId === corsair.activeBuildId && h.slotLabel === donorSlotLabel ? { ...h, installedItem: BORROW_CANDIDATE, installedEntityClass: donorEntry.entityClass, status: 'Upgrade Available' as const } : h
      ),
    }))
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    const html = (disclosure as unknown as { container?: HTMLElement }).container?.innerHTML ?? document.body.innerHTML
    const reservedIdx = html.indexOf('RESERVED')
    const upgradeIdx = html.indexOf('UPGRADE')
    const newIdx = html.indexOf('>NEW<')
    const borrowIdx = html.indexOf('BORROW?')
    expect(reservedIdx).toBeGreaterThan(-1)
    expect(upgradeIdx).toBeGreaterThan(reservedIdx)
    expect(newIdx).toBeGreaterThan(upgradeIdx)
    expect(borrowIdx).toBeGreaterThan(newIdx)
  })

  it('AVAILABLE > UPGRADE > NEW > BORROW? when nothing is reserved', () => {
    if (catalogComponentsByName.size === 0) return
    const targetEntry = catalogComponentsByName.get(ALT_TARGET)!
    const upgradeEntry = catalogComponentsByName.get(UPGRADE_CANDIDATE)!
    const donorEntry = catalogComponentsByName.get(BORROW_CANDIDATE)!
    const corsair = useFleetStore.getState().ships.find((s) => s.id === 'corsair')!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    const donorSlotLabel = 'A Shield Generator'
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: targetEntry.entityClass })
    useFleetStore.setState((s) => ({
      hangarItems: [
        { id: 'r1', name: ALT_TARGET, type: targetEntry.category, size: `S${targetEntry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: targetEntry.entityClass } as HangarItem,
        { id: 'u1', name: UPGRADE_CANDIDATE, type: upgradeEntry.category, size: `S${upgradeEntry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: upgradeEntry.entityClass } as HangarItem,
      ],
      installedLoadouts: [{ shipId: 'corsair', slotLabel: donorSlotLabel, installedItem: BORROW_CANDIDATE, entityClass: donorEntry.entityClass }],
      hardpoints: s.hardpoints.map((h) =>
        h.buildId === corsair.activeBuildId && h.slotLabel === donorSlotLabel ? { ...h, installedItem: BORROW_CANDIDATE, installedEntityClass: donorEntry.entityClass, status: 'Upgrade Available' as const } : h
      ),
    }))
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    expect(disclosure.queryByText('RESERVED')).not.toBeInTheDocument()
    const html = (disclosure as unknown as { container?: HTMLElement }).container?.innerHTML ?? document.body.innerHTML
    const availableIdx = html.indexOf('AVAILABLE')
    const upgradeIdx = html.indexOf('UPGRADE')
    const newIdx = html.indexOf('>NEW<')
    const borrowIdx = html.indexOf('BORROW?')
    expect(availableIdx).toBeGreaterThan(-1)
    expect(upgradeIdx).toBeGreaterThan(availableIdx)
    expect(newIdx).toBeGreaterThan(upgradeIdx)
    expect(borrowIdx).toBeGreaterThan(newIdx)
  })

  it('NEW always renders even when nothing else does, keeping the "always reachable" guarantee', () => {
    if (catalogComponentsByName.size === 0) return
    useFleetStore.setState({ hangarItems: [], reservations: [], installedLoadouts: [] })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    expect(disclosure.getByText('NEW')).toBeInTheDocument()
    expect(disclosure.getByText('Install New Component')).toBeInTheDocument()
  })
})
