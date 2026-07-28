import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'
import type { Hardpoint, HangarItem, MissionReservation, InstalledLoadoutEntry } from '../../types'

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

/** Expands the "Install / Change" disclosure for a specific port row and
 * returns that disclosure's own <tr> (the port row's next sibling) so
 * every subsequent query can be scoped to it — the port row itself and
 * OTHER rows (e.g. one that already has this same component installed)
 * can otherwise contain ambiguous, identically-worded text. */
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

// "Right Shield Generator" ships factory/installed/target all as
// "Shimmer" (Grade C, status 'OK') — a real, compatible, currently-
// UNINSTALLED alternate Target ("FR-66", Grade A) and a real, compatible,
// currently-uninstalled, genuinely BETTER-graded candidate than Shimmer
// ("Mirage", Grade A) are both used below, matching EWO-070's own
// established substitute-name precedent for this exact port.
const SLOT = 'Right Shield Generator'
const FACTORY_INSTALLED = 'Shimmer'
const ALT_TARGET = 'FR-66'
const UPGRADE_CANDIDATE = 'Mirage'

/**
 * SW-014A — Inline Installed Component Workflow, refactored by EWO-071
 * ("Install/Change Source Ladder Refactor") onto four canonical,
 * priority-ordered groups — RESERVED > AVAILABLE > UPGRADE > BORROW —
 * plus the always-reachable Install New Component action. Every
 * scenario here still exercises the SAME store actions
 * (`installComponent`/`removeComponent`/`addHangarItem`/
 * `releaseReservation`) Quick Update, Hangar Inventory, and Manage
 * Loadout already use — this suite verifies Ship Workspace's own inline
 * UI wiring onto them, never a second transaction implementation.
 *
 * Root constraint carried over from EWO-070: the installation engine's
 * own `resolveDestinationHardpoint` refuses to target a port whose status
 * is already 'OK'. "Right Shield Generator" starts 'OK' — every scenario
 * below that installs while the port is still fully satisfied is also,
 * incidentally, exercising EWO-070's own remove-then-install fix; every
 * one explicitly asserts `targetItem` is never silently rewritten by
 * whatever gets physically installed.
 */
describe('SW-014A / EWO-071: RESERVED group', () => {
  it('the exact Target, reserved for this port, shows under RESERVED and installs directly — Target preserved', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(ALT_TARGET)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: entry.entityClass })
    useFleetStore.setState({
      hangarItems: [{ id: 'r1', name: ALT_TARGET, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
      reservations: [
        {
          id: 'res-own',
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
    const disclosure = within(expandInstall(SLOT))

    expect(disclosure.getByText('RESERVED')).toBeInTheDocument()
    expect(disclosure.getByText(ALT_TARGET)).toBeInTheDocument()
    expect(disclosure.getByText('Reserved for this port')).toBeInTheDocument()

    fireEvent.click(disclosure.getByRole('button', { name: /^Install$/ }))

    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(ALT_TARGET)
    expect(hp.targetItem).toBe(ALT_TARGET)
  })

  it('a reservation belonging to a DIFFERENT Loadout no longer appears anywhere in this disclosure (EWO-071 drops the cross-Loadout reassign tier)', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(ALT_TARGET)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: entry.entityClass })
    useFleetStore.setState({
      hangarItems: [{ id: 'r2', name: ALT_TARGET, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
      reservations: [
        {
          id: 'res-elsewhere',
          missionConfigurationId: 'ghost-escort',
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
    const disclosure = within(expandInstall(SLOT))

    expect(disclosure.queryByText('RESERVED')).not.toBeInTheDocument()
    expect(disclosure.queryByText('AVAILABLE')).not.toBeInTheDocument()
    expect(disclosure.queryByText(ALT_TARGET)).not.toBeInTheDocument()
    expect(screen.queryByText(/Reassign/)).not.toBeInTheDocument()
  })
})

describe('SW-014A / EWO-071: AVAILABLE group', () => {
  it('the exact Target, genuinely free in Hangar, shows under AVAILABLE with its quantity — Target preserved', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(ALT_TARGET)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: entry.entityClass })
    useFleetStore.setState({
      hangarItems: [{ id: 'a1', name: ALT_TARGET, type: entry.category, size: `S${entry.size}`, qty: 2, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    expect(disclosure.queryByText('RESERVED')).not.toBeInTheDocument()
    expect(disclosure.getByText('AVAILABLE')).toBeInTheDocument()
    expect(disclosure.getByText(ALT_TARGET)).toBeInTheDocument()
    expect(disclosure.getByText('2 Available')).toBeInTheDocument()

    fireEvent.click(disclosure.getByRole('button', { name: /^Install$/ }))
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(ALT_TARGET)
    expect(hp.targetItem).toBe(ALT_TARGET)
  })

  it('EWO-071A (Part A): a committed unit and a separate genuinely free unit of the exact Target fold into ONE Reserved row — never a competing Available group', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(ALT_TARGET)!
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    patchHardpoint(ship.activeBuildId, SLOT, { targetItem: ALT_TARGET, targetEntityClass: entry.entityClass })
    useFleetStore.setState({
      hangarItems: [{ id: 'a2', name: ALT_TARGET, type: entry.category, size: `S${entry.size}`, qty: 2, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
      reservations: [
        {
          id: 'res-own-2',
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
    const disclosure = within(expandInstall(SLOT))

    expect(disclosure.getByText('RESERVED')).toBeInTheDocument()
    expect(disclosure.queryByText('AVAILABLE')).not.toBeInTheDocument()
    expect(disclosure.getByText('Reserved for this port')).toBeInTheDocument()
    expect(disclosure.getByText('+1 additional available')).toBeInTheDocument()
    expect(disclosure.getAllByText(ALT_TARGET)).toHaveLength(1)
  })
})

describe('SW-014A / EWO-071: UPGRADE group', () => {
  it('an owned, genuinely-better-graded compatible candidate (not the Target) shows under UPGRADE with its classification and quantity — Target preserved', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(UPGRADE_CANDIDATE)!
    useFleetStore.setState({
      hangarItems: [{ id: 'u1', name: UPGRADE_CANDIDATE, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    expect(disclosure.getByText('UPGRADE')).toBeInTheDocument()
    expect(disclosure.getByText(UPGRADE_CANDIDATE)).toBeInTheDocument()
    expect(disclosure.getByText(/1 Available/)).toBeInTheDocument()

    fireEvent.click(disclosure.getByRole('button', { name: /^Install$/ }))
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(UPGRADE_CANDIDATE)
    // EWO-070 (Part A) — Target preserved even through the OK-slot
    // remove-then-install path this UPGRADE install exercises.
    expect(hp.targetItem).toBe(FACTORY_INSTALLED)
  })

  it('a compatible candidate that is NOT a genuine improvement over Installed does not render at all (no UPGRADE, no stray group)', () => {
    if (catalogComponentsByName.size === 0) return
    // Debilitator is a real, compatible S1 Shield (per src/data/componentCatalog.ts)
    // with no confirmed Grade in the generated catalog — an unconfirmed
    // improvement must never render as one.
    const lowerOrUnknown = 'Debilitator'
    const entry = catalogComponentsByName.get(lowerOrUnknown)
    if (!entry) return
    useFleetStore.setState({
      hangarItems: [{ id: 'u2', name: lowerOrUnknown, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    expect(disclosure.queryByText('UPGRADE')).not.toBeInTheDocument()
    expect(disclosure.queryByText(lowerOrUnknown)).not.toBeInTheDocument()
  })
})

describe('SW-014A / EWO-071: BORROW group', () => {
  it('a compatible component installed on a different ship shows collapsed under BORROW?, expands with its context, and Confirm Transfer removes it there and installs it here — Target preserved', () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(UPGRADE_CANDIDATE)!
    const corsair = useFleetStore.getState().ships.find((s) => s.id === 'corsair')!
    const donorSlotLabel = 'A Shield Generator' // Corsair's real, existing Shield hardpoint.
    useFleetStore.setState({
      hangarItems: [],
      reservations: [],
      installedLoadouts: [{ shipId: 'corsair', slotLabel: donorSlotLabel, installedItem: UPGRADE_CANDIDATE, entityClass: entry.entityClass } as InstalledLoadoutEntry],
      hardpoints: useFleetStore.getState().hardpoints.map((h) =>
        h.buildId === corsair.activeBuildId && h.slotLabel === donorSlotLabel
          ? { ...h, installedItem: UPGRADE_CANDIDATE, installedEntityClass: entry.entityClass, status: 'Upgrade Available' as const }
          : h
      ),
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    expect(disclosure.getByText('BORROW?')).toBeInTheDocument()
    expect(disclosure.getByText('1 ship available')).toBeInTheDocument()
    expect(disclosure.queryByText(new RegExp(`Installed on Corsair`))).not.toBeInTheDocument()

    fireEvent.click(disclosure.getByRole('button', { name: /BORROW\?.*1 ship available/ }))
    expect(disclosure.getByText(new RegExp(`Installed on Corsair — ${donorSlotLabel}`))).toBeInTheDocument()

    fireEvent.click(disclosure.getByRole('button', { name: /Transfer\?/ }))
    expect(disclosure.getByText(/this removes it there and installs it here/)).toBeInTheDocument()
    fireEvent.click(disclosure.getByRole('button', { name: /Confirm Transfer/ }))

    expect(useFleetStore.getState().installedLoadouts.find((e) => e.shipId === 'corsair' && e.slotLabel === donorSlotLabel)?.installedItem).toBe('—')
    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(UPGRADE_CANDIDATE)
    expect(hp.targetItem).toBe(FACTORY_INSTALLED)
  })
})

describe('SW-014A / EWO-071 / EWO-071B: Install New Component (NEW)', () => {
  it('opens an inline picker (never a dialog), always reachable, and Install adds it to Hangar and installs it in one action — Target preserved', () => {
    if (catalogComponentsByName.size === 0) return
    useFleetStore.setState({ hangarItems: [] })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))

    fireEvent.click(disclosure.getByRole('button', { name: /Install New Component/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const picker = disclosure.getByLabelText(`New acquired component for ${SLOT}`) as HTMLInputElement
    fireEvent.click(picker)
    fireEvent.change(picker, { target: { value: UPGRADE_CANDIDATE } })
    const listboxId = picker.getAttribute('aria-controls')
    fireEvent.click(document.querySelector(`#${listboxId} li button`) as HTMLButtonElement)

    fireEvent.click(disclosure.getByRole('button', { name: /^Install$/ }))

    const ship = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    const hp = useFleetStore.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(UPGRADE_CANDIDATE)
    expect(hp.targetItem).toBe(FACTORY_INSTALLED)
    const remaining = useFleetStore.getState().hangarItems.filter((h) => h.name === UPGRADE_CANDIDATE).reduce((sum, h) => sum + h.qty, 0)
    expect(remaining).toBe(0)
  })
})

describe('SW-014A: Regression — Remove Installed Component still works unchanged', () => {
  it('Remove still opens its own confirm modal (the one deliberate dialog exception) and still functions after this mission\'s changes', () => {
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const removeButtons = screen.getAllByRole('button', { name: /Remove/ })
    expect(removeButtons.length).toBeGreaterThan(0)
    fireEvent.click(removeButtons[0])
    expect(screen.getByText(/Remove "/)).toBeInTheDocument()
  })
})

describe('SW-014A: Persistence', () => {
  it('an install performed through the inline workflow survives a genuine reload', async () => {
    if (catalogComponentsByName.size === 0) return
    const entry = catalogComponentsByName.get(UPGRADE_CANDIDATE)!
    useFleetStore.setState({
      hangarItems: [{ id: 'test-hangar-persist', name: UPGRADE_CANDIDATE, type: entry.category, size: `S${entry.size}`, qty: 1, neededBy: 'None', disposition: 'Store', entityClass: entry.entityClass } as HangarItem],
    })
    renderWorkspace('ghost')
    fireEvent.click(screen.getByRole('button', { name: /Change Installed Components/ }))
    const disclosure = within(expandInstall(SLOT))
    fireEvent.click(disclosure.getByRole('button', { name: /^Install$/ }))

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../../store/useFleetStore')
    const ship = reloaded.getState().ships.find((s) => s.id === 'ghost')!
    const hp = reloaded.getState().hardpoints.find((h) => h.buildId === ship.activeBuildId && h.slotLabel === SLOT)!
    expect(hp.installedItem).toBe(UPGRADE_CANDIDATE)
    expect(reloaded.getState().installedLoadouts.find((e) => e.shipId === 'ghost' && e.slotLabel === SLOT)?.installedItem).toBe(UPGRADE_CANDIDATE)
    expect(hp.targetItem).toBe(FACTORY_INSTALLED)
  })
})
