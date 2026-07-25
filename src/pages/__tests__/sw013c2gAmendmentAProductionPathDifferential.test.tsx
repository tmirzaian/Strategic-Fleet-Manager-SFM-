import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

beforeEach(() => {
  localStorage.clear()
  // A genuinely fresh store module per test, not whatever a previous test
  // in this file left behind in memory — required for the
  // vi.resetModules()-based "genuine reload" pattern below (same
  // convention as src/store/__tests__/persistenceIncident.test.ts).
  vi.resetModules()
  // @ts-expect-error — test-only global stub, not a real IntersectionObserver
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  localStorage.clear()
})

async function renderGhostWorkspace() {
  const { useFleetStore } = await import('../../store/useFleetStore')
  const ShipWorkspacePrototype = (await import('../ShipWorkspacePrototype')).default
  render(
    <MemoryRouter initialEntries={['/ship-workspace/ghost']}>
      <Routes>
        <Route path="/ship-workspace/:shipId" element={<ShipWorkspacePrototype />} />
      </Routes>
    </MemoryRouter>
  )
  for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)
  fireEvent.click(screen.getByText(/Manage Loadout/))
  for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)
  return useFleetStore
}

/**
 * SW-013C.2G Amendment A — Production Path Differential Analysis.
 *
 * Commander operational validation reported the Nose Turret never appears
 * as a selectable candidate on a real running dev server, despite every
 * test in sw013c2gDormantHardpointMaterialization.test.tsx passing. Those
 * tests all add the Ghost fresh via `addFleetAsset`, which never exercises
 * two realistic production paths a Commander's own browser actually goes
 * through: (1) the pre-existing seed 'ghost' fixture's own row-construction
 * path (`useFleetStore.ts`'s `buildCanonicalSeedCustomBuilds`, a third,
 * independent duplicate of `materializeFleetAsset`'s row shape that had
 * never been updated to carry `isDormant`/`dormantDonorShipEntityClass` —
 * fixed in this Amendment), and (2) a genuinely OLD `localStorage` save
 * (predating this feature entirely) reconciling forward on a real reload.
 * Both are covered here directly, using the same `vi.resetModules()` +
 * re-`import()` "genuine reload" convention already established by
 * `src/store/__tests__/persistenceIncident.test.ts`.
 */
describe('SW-013C.2G Amendment A: production path differential — seed Ghost fixture', () => {
  it('the pre-existing seed Ghost ship (no addFleetAsset call, no localStorage at all) shows the Nose Weapon row with turret candidates', async () => {
    const useFleetStore = await renderGhostWorkspace()
    if ((await import('../../generated/componentCatalog')).catalogComponentsByName.size === 0) return

    const nose = useFleetStore.getState().hardpoints.find((h) => h.shipId === 'ghost' && h.buildId === 'ghost-stealth' && h.sourceItemPortName === 'hardpoint_weapon_nose')
    expect(nose?.isDormant).toBe(true)
    expect(nose?.dormantDonorShipEntityClass).toBe('ANVL_Hornet_F7CM_Mk2')

    const noseInput = screen.getByLabelText('New target for Nose Weapon') as HTMLInputElement
    fireEvent.click(noseInput)
    const listboxId = noseInput.getAttribute('aria-controls')
    const options = Array.from(document.querySelectorAll(`#${listboxId} li`)).map((li) => li.textContent ?? '')
    // SW-013C.2G Amendment C restricted the Ghost's own candidate list to
    // the one vessel-compatible turret (S2) — the swap group's OTHER
    // member (F7A/S3) is real but confirmed invalid for this hull.
    expect(options.some((o) => o.includes('Anvil Hornet Mk II S2 Nose Turret'))).toBe(true)
  })

  it('the SEPARATE Nose Cone (Cap) row exists alongside the Nose Weapon row and, correctly, offers no turret of its own — the two must not be conflated', async () => {
    await renderGhostWorkspace()
    if ((await import('../../generated/componentCatalog')).catalogComponentsByName.size === 0) return

    expect(screen.getByLabelText('New target for Nose Cone')).toBeInTheDocument()
    expect(screen.getByLabelText('New target for Nose Weapon')).toBeInTheDocument()

    const capInput = screen.getByLabelText('New target for Nose Cone') as HTMLInputElement
    fireEvent.click(capInput)
    const listboxId = capInput.getAttribute('aria-controls')
    const capOptions = Array.from(document.querySelectorAll(`#${listboxId} li`)).map((li) => li.textContent ?? '')
    // This is the Nose Cone port's own real candidate list — Cap only, no
    // Turret. If a Commander opens THIS row's dropdown expecting the
    // Turret to appear here, it never will: the Turret belongs to the
    // separate "Nose Weapon" row above, not this one.
    expect(capOptions.some((o) => o.includes('Nose Turret'))).toBe(false)
  })

  it('an OLD localStorage save (predating the dormant Nose Weapon port entirely) reconciles the new port in correctly on a genuine reload', async () => {
    // Simulates a save written before SW-013C.2G shipped: the persisted
    // 'ghost-stealth' custom build's own hardpoints array has no row at
    // all for hardpoint_weapon_nose (it didn't exist yet) — only ports
    // that were real at the time. This is what a real Commander's browser
    // localStorage looks like if they last used the app before this
    // feature merged; restarting the dev server does NOT clear it.
    localStorage.setItem(
      'sfm-fleet-store',
      JSON.stringify({
        state: {
          fleetAssets: [],
          hangarItems: [],
          reservations: [],
          installedLoadouts: [{ shipId: 'ghost', slotLabel: 'Left Cooler', installedItem: 'SnowBlind' }],
          seedAssetOverrides: {},
          customBuilds: [{ id: 'ghost-stealth', shipId: 'ghost', name: 'Stealth Build', role: 'Stealth Fighter', readiness: 82, isActive: true, missing: [], kind: 'CUSTOM' }],
          customBuildHardpoints: [
            {
              id: 'ghost-stealth-hp-0',
              shipId: 'ghost',
              buildId: 'ghost-stealth',
              slotLabel: 'Nose Cone',
              type: 'Module',
              size: 'S1',
              factoryItem: 'ANVL F7 Mk2 NoseCap',
              installedItem: 'ANVL F7 Mk2 NoseCap',
              targetItem: 'ANVL F7 Mk2 NoseCap',
              status: 'OK',
            },
            {
              id: 'ghost-stealth-hp-1',
              shipId: 'ghost',
              buildId: 'ghost-stealth',
              slotLabel: 'Left Cooler',
              type: 'Cooler',
              size: 'S1',
              factoryItem: 'Ravage',
              installedItem: 'SnowBlind',
              targetItem: 'SnowBlind',
              status: 'OK',
            },
          ],
          activeBuildByShipId: { ghost: 'ghost-stealth' },
          quarantinedAssignments: [],
          seedFleetLegacyInstall: true,
        },
        version: 8,
      })
    )

    const useFleetStore = await renderGhostWorkspace()
    if ((await import('../../generated/componentCatalog')).catalogComponentsByName.size === 0) return

    const nose = useFleetStore.getState().hardpoints.find((h) => h.shipId === 'ghost' && h.buildId === 'ghost-stealth' && h.sourceItemPortName === 'hardpoint_weapon_nose')
    expect(nose).toBeDefined()
    expect(nose?.isDormant).toBe(true)

    const noseInput = screen.getByLabelText('New target for Nose Weapon') as HTMLInputElement
    fireEvent.click(noseInput)
    const listboxId = noseInput.getAttribute('aria-controls')
    const options = Array.from(document.querySelectorAll(`#${listboxId} li`)).map((li) => li.textContent ?? '')
    expect(options.some((o) => o.includes('Anvil Hornet Mk II S2 Nose Turret'))).toBe(true)

    // The pre-existing Nose Cone assignment (SnowBlind on Left Cooler,
    // the Cap on Nose Cone) must survive reconciliation untouched.
    expect(screen.getByLabelText('New target for Nose Cone')).toHaveValue('ANVL F7 Mk2 NoseCap')
  })
})
