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
const FACTORY_INSTALLED = 'Shimmer' // Grade C
const ALT_TARGET = 'FR-66' // Grade A
const UPGRADE_CANDIDATE = 'Mirage' // Grade A — genuinely better than Shimmer
const BORROW_CANDIDATE = 'Veil' // Grade B — a real, distinct compatible S1 Shield, deliberately not owned anywhere
const LOWER_GRADE_CANDIDATE = 'Steward' // Grade D — genuinely worse than Shimmer

/**
 * EWO-071 — "Install/Change Source Ladder Refactor." Dedicated regression
 * coverage for the work order's own itemized Regression Requirements
 * list, beyond what sw014aInlineInstalledComponentWorkflow.test.tsx
 * already certifies per-group (install mechanics, Target preservation).
 * This file is presentation/structure-focused: canonical order, canonical
 * treatments, absence of retired copy, and reactive recalculation.
 */
describe('EWO-071: removed instructional copy and redundant callouts (Part A)', () => {
  it('the old numbered Component Selection Priority instructional block is gone', () => {
    if (catalogComponentsByName.size === 0) return
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    expect(disclosure.queryByText(/already committed to another Loadout; reassigning it resolves/)).not.toBeInTheDocument()
    expect(disclosure.queryByText(/genuinely free stock, immediately installable/)).not.toBeInTheDocument()
    expect(disclosure.queryByText(/looted, purchased, crafted, or NPC acquired/)).not.toBeInTheDocument()
    expect(disclosure.queryByText(/Borrow Intelligence, collapsed by default/)).not.toBeInTheDocument()
    expect(disclosure.queryByText(/reference list, collapsed by default/)).not.toBeInTheDocument()
  })

  it('the redundant "Compatible Upgrade Opportunity" Installed-vs-Target callout is gone, even when the row is a real Upgrade-Available mismatch', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(ALT_TARGET)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: entry.entityClass, status: 'Upgrade Available' })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    expect(disclosure.queryByText(/Compatible Upgrade Opportunity/)).not.toBeInTheDocument()
    expect(disclosure.queryByText(/is installed;.*is the current Target/)).not.toBeInTheDocument()
  })
})

describe('EWO-071: canonical group order and empty-group suppression (Part B)', () => {
  it('renders Reserved, Upgrade, and Borrow in that exact order (EWO-071A: Reserved wins outright, so Available never coexists with Reserved for the same port)', () => {
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

    expect(disclosure.queryByText('AVAILABLE')).not.toBeInTheDocument()
    const html = (disclosure as unknown as { container?: HTMLElement }).container?.innerHTML ?? document.body.innerHTML
    const reservedIdx = html.indexOf('RESERVED')
    const upgradeIdx = html.indexOf('UPGRADE')
    const borrowIdx = html.indexOf('BORROW?')
    expect(reservedIdx).toBeGreaterThan(-1)
    expect(upgradeIdx).toBeGreaterThan(reservedIdx)
    expect(borrowIdx).toBeGreaterThan(upgradeIdx)
  })

  it('renders Available before Upgrade before Borrow when the Target has no Reservation at all', () => {
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
    const borrowIdx = html.indexOf('BORROW?')
    expect(availableIdx).toBeGreaterThan(-1)
    expect(upgradeIdx).toBeGreaterThan(availableIdx)
    expect(borrowIdx).toBeGreaterThan(upgradeIdx)
  })

  it('a port with nothing reserved, available, upgradeable, or borrowable renders none of the fulfillment-source pills — only the always-present NEW group (EWO-071B)', () => {
    if (catalogComponentsByName.size === 0) return
    useFleetStore.setState({ hangarItems: [], reservations: [], installedLoadouts: [] })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    expect(disclosure.queryByText('RESERVED')).not.toBeInTheDocument()
    expect(disclosure.queryByText('AVAILABLE')).not.toBeInTheDocument()
    expect(disclosure.queryByText('UPGRADE')).not.toBeInTheDocument()
    expect(disclosure.queryByText('BORROW?')).not.toBeInTheDocument()
    expect(disclosure.getByText('NEW')).toBeInTheDocument()
    expect(disclosure.getByText('Install New Component')).toBeInTheDocument()
  })
})

describe('EWO-071: canonical color treatments (Part C/D/E/F)', () => {
  it('Reserved uses the canonical cyan pill, Upgrade uses Quartermaster Gold, Borrow uses neutral muted (never cyan/success/gold)', () => {
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

    expect(disclosure.getByText('RESERVED').className).toContain('text-cyan')
    expect(disclosure.getByText('UPGRADE').className).toContain('text-gold')
    expect(disclosure.getByText('BORROW?').className).toContain('text-muted')
    expect(disclosure.getByText('BORROW?').className).not.toContain('text-cyan')
    expect(disclosure.getByText('BORROW?').className).not.toContain('text-success')
    expect(disclosure.getByText('BORROW?').className).not.toContain('text-gold')
  })

  it('Available uses the canonical green/success pill when no Reservation competes for the Target', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(ALT_TARGET)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: entry.entityClass })
    useFleetStore.setState({
      hangarItems: [{ id: 'a1', name: ALT_TARGET, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    expect(disclosure.getByText('AVAILABLE').className).toContain('text-success')
  })

  it('Borrow stays collapsed by default — donor context only appears after expanding', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(BORROW_CANDIDATE)!
    const corsair = useFleetStore.getState().ships.find((s) => s.id === 'corsair')!
    const donorSlotLabel = 'A Shield Generator'
    useFleetStore.setState((s) => ({
      installedLoadouts: [{ shipId: 'corsair', slotLabel: donorSlotLabel, installedItem: BORROW_CANDIDATE, entityClass: entry.entityClass }],
      hardpoints: s.hardpoints.map((h) =>
        h.buildId === corsair.activeBuildId && h.slotLabel === donorSlotLabel ? { ...h, installedItem: BORROW_CANDIDATE, installedEntityClass: entry.entityClass, status: 'Upgrade Available' as const } : h
      ),
    }))
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    expect(disclosure.getByText('BORROW?')).toBeInTheDocument()
    expect(disclosure.queryByText(/Installed on Corsair/)).not.toBeInTheDocument()
    expect(disclosure.queryByRole('button', { name: /Transfer\?/ })).not.toBeInTheDocument()
  })
})

describe('EWO-071: Upgrade qualification (Part E/H)', () => {
  it('a real, confirmed LOWER-grade compatible candidate never renders as UPGRADE (or anywhere else)', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(LOWER_GRADE_CANDIDATE)
    if (!entry) return
    useFleetStore.setState({
      hangarItems: [{ id: 'low1', name: LOWER_GRADE_CANDIDATE, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    expect(disclosure.queryByText('UPGRADE')).not.toBeInTheDocument()
    expect(disclosure.queryByText(LOWER_GRADE_CANDIDATE)).not.toBeInTheDocument()
  })
})

describe('EWO-071: Remaining Compatible Components fully removed (Part G)', () => {
  it('no reference/catalog-browse section renders, expanded or collapsed, regardless of how many other compatible components exist', () => {
    if (catalogComponentsByName.size === 0) return
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    expect(disclosure.queryByText(/Remaining Compatible Components/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Remaining Compatible Components/)).not.toBeInTheDocument()
  })
})

describe('EWO-071: reactive recalculation after install (Part J)', () => {
  it('after installing from AVAILABLE, the Hangar quantity decreases, the Installed cell updates, and the group recalculates on next expand', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(ALT_TARGET)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: entry.entityClass })
    useFleetStore.setState({
      hangarItems: [{ id: 'a1', name: ALT_TARGET, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    let disclosure = within(expandInstall(SLOT))
    expect(disclosure.getByText('1 Available')).toBeInTheDocument()
    fireEvent.click(disclosure.getByRole('button', { name: /^Install$/ }))

    const row = getPortRow(SLOT)
    // Installed and Target now both read FR-66 (the install just satisfied
    // the port) — two real, distinct cells legitimately share the text.
    expect(within(row).getAllByText(ALT_TARGET).length).toBe(2)
    expect(useFleetStore.getState().hangarItems.find((h) => h.id === 'a1')?.qty ?? 0).toBe(0)

    // The disclosure stays open (a successful install never closes it) and
    // is already reactive: the port is now 'OK' (installed === target), so
    // AVAILABLE no longer has anything to offer for this exact port, since
    // the Hangar stock is gone and nothing remains outstanding — no
    // second action (re-click, refresh) required.
    disclosure = within(row.nextElementSibling as HTMLElement)
    expect(disclosure.queryByText('AVAILABLE')).not.toBeInTheDocument()
  })
})
