import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName } from '../../generated/componentCatalog'
import { importedShips } from '../../generated/importedShips'
import { CONFIRMED_DORMANT_HARDPOINTS, materializeDormantPorts } from '../../generated/dormantHardpoints'

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

const GHOST_SHIP_ID = 'hornet-f7cs-mk2-imported'

function renderShipWorkspace(shipDefinitionId: string) {
  const result = useFleetStore.getState().addFleetAsset(shipDefinitionId, 'OWNED')
  render(
    <MemoryRouter initialEntries={[`/ship-workspace/${result.assetId}`]}>
      <Routes>
        <Route path="/ship-workspace/:shipId" element={<ShipWorkspacePrototype />} />
      </Routes>
    </MemoryRouter>
  )
  for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)
  fireEvent.click(screen.getByText(/Manage Loadout/))
  for (const btn of screen.getAllByText('Expand All')) fireEvent.click(btn)
  return result
}

function selectFirstOption(input: HTMLInputElement, query: string) {
  fireEvent.click(input)
  fireEvent.change(input, { target: { value: query } })
  const listboxId = input.getAttribute('aria-controls')
  fireEvent.click(document.querySelector(`#${listboxId} li button`) as HTMLButtonElement)
}

/**
 * SW-013C.2G — Dormant Hardpoint Materialization: Hornet Ghost Mk II Nose
 * Turret Closure.
 *
 * Root gap: the Ghost's own real StarBreaker geometry export
 * (`raw-data/ANVL_Hornet_F7CS_Mk2.json`'s `root_nmc`) confirms
 * `hardpoint_weapon_nose` physically exists on the Ghost's own hull, but
 * the Ghost's own `loadout` array carries ZERO entry for it — a genuinely
 * different evidentiary shape from the Ghost's Nose Cone (`hardpoint_nose_cone`,
 * real, occupied, ANVL_F7_Mk2_NoseCap). `src/generated/dormantHardpoints.ts`
 * materializes this ONE port (never mutating `generated-data/ports.json`)
 * from a small, individually-curated, evidence-gated list — see that
 * module's own doc comment for the full four-point evidence standard.
 */
describe('SW-013C.2G: Ghost Nose dormant hardpoint materializes correctly', () => {
  it('both the real Nose Cone (Cap) and the materialized Nose Weapon (Turret) rows appear', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace(GHOST_SHIP_ID)
    expect(screen.getByLabelText('New target for Nose Cone')).toBeInTheDocument()
    expect(screen.getByLabelText('New target for Nose Weapon')).toBeInTheDocument()
  })

  it('the Nose Weapon picker offers exactly ONE vessel-compatible turret candidate — the swap group\'s OTHER member is excluded (SW-013C.2G Amendment C)', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace(GHOST_SHIP_ID)
    const noseInput = screen.getByLabelText('New target for Nose Weapon') as HTMLInputElement
    fireEvent.click(noseInput)
    const listboxId = noseInput.getAttribute('aria-controls')
    const options = Array.from(document.querySelectorAll(`#${listboxId} li`)).map((li) => li.textContent ?? '')
    expect(options).toHaveLength(2) // Intentional Empty + the one confirmed, vessel-compatible turret
    expect(options.some((o) => o.includes('Intentional Empty'))).toBe(true)
    expect(options.some((o) => o.includes('Anvil Hornet Mk II S2 Nose Turret'))).toBe(true)
    // ANVL_Hornet_F7A_Nose_Turret ("S3 Nose Turret") is a real, confirmed
    // swap-group member — but only on the ships that actually earn it
    // (F7A/F7CM military family). Amendment C's own DataCore differential
    // (AttachDef.RequiredTags divergence + factory-installation pattern +
    // independent SPPV corroboration) excludes it from the Ghost
    // specifically. See dormantHardpoints.ts's own doc comment.
    expect(options.some((o) => o.includes('Anvil Hornet Mk II S3 Nose Turret'))).toBe(false)
  })

  it('selecting the one confirmed turret variant contributes exactly two S2 weapon children (Amendment C: corrected from S3 via the turret\'s own intrinsic ports) with independent targets', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace(GHOST_SHIP_ID)
    const noseInput = screen.getByLabelText('New target for Nose Weapon') as HTMLInputElement
    selectFirstOption(noseInput, 'S2 Nose Turret')

    const slot1 = screen.getByLabelText('New target for Weapon Slot 1') as HTMLInputElement
    const slot2 = screen.getByLabelText('New target for Weapon Slot 2') as HTMLInputElement
    expect(slot1).toBeInTheDocument()
    expect(slot2).toBeInTheDocument()

    selectFirstOption(slot1, 'Omnisky')
    selectFirstOption(slot2, 'Scattergun')

    // Mixed, independent targets — no sibling coupling.
    expect(slot1.value).toBe('Omnisky VI Cannon')
    expect(slot2.value).toBe('Dominance-2 Scattergun')
  })

  it('mixed weapon selections save and survive a genuine store reload, with the dormant marker intact', async () => {
    if (catalogComponentsByName.size === 0) return
    const added = renderShipWorkspace(GHOST_SHIP_ID)
    const noseInput = screen.getByLabelText('New target for Nose Weapon') as HTMLInputElement
    selectFirstOption(noseInput, 'S2 Nose Turret')
    selectFirstOption(screen.getByLabelText('New target for Weapon Slot 1') as HTMLInputElement, 'Omnisky')
    selectFirstOption(screen.getByLabelText('New target for Weapon Slot 2') as HTMLInputElement, 'Scattergun')

    fireEvent.click(screen.getAllByText('Save Changes')[0])
    expect(screen.queryByText(/Could not save/)).not.toBeInTheDocument()

    const build = useFleetStore.getState().builds.find((b) => b.shipId === added.assetId)!

    vi.resetModules()
    const { useFleetStore: reloaded } = await import('../../store/useFleetStore')
    const { prepareCanonicalHardpoints } = await import('../../utils/canonicalHardpointPreparation')
    const reloadedHardpoints = reloaded.getState().hardpoints.filter((h) => h.buildId === build.id)
    const prepared = prepareCanonicalHardpoints(added.assetId!, reloadedHardpoints, reloaded.getState().fleetAssets)

    const nose = prepared.find((h) => h.sourceItemPortName === 'hardpoint_weapon_nose')!
    expect(nose.isDormant).toBe(true)
    expect(nose.targetEntityClass).toBe('ANVL_Hornet_F7C_Mk2_Nose_Turret')

    const children = prepared.filter((h) => h.parentSlotLabel === nose.slotLabel)
    expect(children).toHaveLength(2)
    const byLabel = new Map(children.map((c) => [c.slotLabel, c]))
    expect(byLabel.get('Nose Weapon — Weapon Slot 1')?.targetItem).toBe('Omnisky VI Cannon')
    expect(byLabel.get('Nose Weapon — Weapon Slot 2')?.targetItem).toBe('Dominance-2 Scattergun')
    expect(children.every((c) => c.size === 'S2')).toBe(true)
  })

  it('switching the turret back to Intentional Empty removes the weapon children cleanly, without touching the Nose Cap', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace(GHOST_SHIP_ID)
    const noseInput = screen.getByLabelText('New target for Nose Weapon') as HTMLInputElement
    selectFirstOption(noseInput, 'S2 Nose Turret')
    expect(screen.getByLabelText('New target for Weapon Slot 1')).toBeInTheDocument()

    selectFirstOption(noseInput, 'Intentional Empty')
    expect(screen.queryByLabelText('New target for Weapon Slot 1')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('New target for Weapon Slot 2')).not.toBeInTheDocument()
    expect(screen.getByLabelText('New target for Nose Cone')).toBeInTheDocument()
  })

  it('re-selecting the turret after clearing it regenerates clean (empty) children — no stale weapon targets migrate', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace(GHOST_SHIP_ID)
    const noseInput = screen.getByLabelText('New target for Nose Weapon') as HTMLInputElement
    selectFirstOption(noseInput, 'S2 Nose Turret')
    selectFirstOption(screen.getByLabelText('New target for Weapon Slot 1') as HTMLInputElement, 'Omnisky')

    selectFirstOption(noseInput, 'Intentional Empty')
    selectFirstOption(noseInput, 'S2 Nose Turret')

    const slot1Again = screen.getByLabelText('New target for Weapon Slot 1') as HTMLInputElement
    expect(slot1Again.value).toBe('—')
  })

  it('Objective 4\'s exact required sequence: save with turret+weapons -> genuine reload -> revert to Intentional Empty -> save again -> genuine reload -> children absent', async () => {
    if (catalogComponentsByName.size === 0) return
    const added = useFleetStore.getState().addFleetAsset(GHOST_SHIP_ID, 'OWNED')
    if (!added.success || !added.assetId) throw new Error('failed to add Ghost')
    const shipId = added.assetId
    const build = useFleetStore.getState().builds.find((b) => b.shipId === shipId)!
    const nose = useFleetStore.getState().hardpoints.find((h) => h.buildId === build.id && h.sourceItemPortName === 'hardpoint_weapon_nose')!

    // Save 1 — assign the turret and one weapon.
    const save1 = useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'Turret Save',
      startingState: 'EXISTING',
      existingBuildId: build.id,
      targetOverrides: {
        [nose.slotLabel]: { targetItem: 'Anvil Hornet Mk II S2 Nose Turret', targetEntityClass: 'ANVL_Hornet_F7C_Mk2_Nose_Turret' },
        [`${nose.slotLabel} — Weapon Slot 1`]: { targetItem: 'Omnisky VI Cannon', targetEntityClass: 'AMRS_LaserCannon_S2' },
      },
      setActive: true,
      saveAsNew: false,
    })
    expect(save1.success).toBe(true)

    // Genuine reload — parent and both children survive (Weapon Slot 2 real, unassigned).
    vi.resetModules()
    let reloadedModule = await import('../../store/useFleetStore')
    let reloadedHardpoints = reloadedModule.useFleetStore.getState().hardpoints.filter((h) => h.buildId === build.id)
    let children = reloadedHardpoints.filter((h) => h.parentSlotLabel === nose.slotLabel)
    expect(children).toHaveLength(2)
    expect(children.find((c) => c.slotLabel.endsWith('Slot 1'))?.targetItem).toBe('Omnisky VI Cannon')

    // Save 2 — revert the turret itself to Intentional Empty.
    const save2 = reloadedModule.useFleetStore.getState().saveMissionConfiguration({
      shipId,
      name: 'Revert Save',
      startingState: 'EXISTING',
      existingBuildId: build.id,
      targetOverrides: { [nose.slotLabel]: { targetItem: '—', targetEntityClass: undefined } },
      setActive: true,
      saveAsNew: false,
    })
    expect(save2.success).toBe(true)

    // Genuine reload again — child weapon rows are gone.
    vi.resetModules()
    reloadedModule = await import('../../store/useFleetStore')
    reloadedHardpoints = reloadedModule.useFleetStore.getState().hardpoints.filter((h) => h.buildId === build.id)
    children = reloadedHardpoints.filter((h) => h.parentSlotLabel === nose.slotLabel)
    expect(children).toHaveLength(0)
    const noseAfter = reloadedHardpoints.find((h) => h.slotLabel === nose.slotLabel)!
    expect(noseAfter.targetItem).toBe('—')
  })

  it('SW-013C.2G Amendment C: the excluded swap-group member (F7A / "S3 Nose Turret") cannot be found or selected on the Ghost at all — searching for it yields no matching candidate', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace(GHOST_SHIP_ID)
    const noseInput = screen.getByLabelText('New target for Nose Weapon') as HTMLInputElement
    fireEvent.click(noseInput)
    fireEvent.change(noseInput, { target: { value: 'S3 Nose Turret' } })
    const listboxId = noseInput.getAttribute('aria-controls')
    const options = Array.from(document.querySelectorAll(`#${listboxId} li`)).map((li) => li.textContent ?? '')
    // No real candidate matches the search text — only the picker's own
    // "No matching component" fallback row (never the excluded turret).
    expect(options.some((o) => o.includes('Nose Turret'))).toBe(false)
  })

  it('no duplicate Nose Weapon port is ever created — materializeDormantPorts is a no-op when a real imported port of the identical internalName already exists', () => {
    const fakeRealPort = {
      id: `${GHOST_SHIP_ID}-port-/hardpoint_weapon_nose`,
      shipId: GHOST_SHIP_ID,
      parentPortId: null,
      equipmentGroup: 'Weapons' as const,
      internalName: 'hardpoint_weapon_nose',
      displayName: 'Nose Weapon (real, hypothetically re-imported)',
      allowedTypes: [],
      allowedSubtypes: [],
      minSize: 3,
      maxSize: 3,
    }
    const result = materializeDormantPorts(GHOST_SHIP_ID, [fakeRealPort])
    expect(result).toHaveLength(0)
  })
})

describe('SW-013C.2G: negative controls', () => {
  it('Hornet variants without authoritative dormant-port evidence do not gain the port', () => {
    // Every currently-imported Hornet Mk II variant that already occupies
    // hardpoint_weapon_nose for real is untouched by materialization
    // (dedup confirmed above); every OTHER real ship in the fleet was
    // never individually confirmed and must not gain a synthetic port
    // either — spot-check a few unrelated real ships.
    for (const shipId of ['hornet-f7cm-mk2-imported', 'eclipse-imported', 'avenger-warlock-imported']) {
      const view = importedShips[shipId]
      if (!view) continue
      const dormantOnThisShip = view.ports.filter((p) => p.isDormant)
      expect(dormantOnThisShip).toHaveLength(0)
    }
  })

  it('CONFIRMED_DORMANT_HARDPOINTS currently contains exactly the one individually-confirmed Ghost Nose entry — no speculative activation', () => {
    expect(CONFIRMED_DORMANT_HARDPOINTS).toHaveLength(1)
    expect(CONFIRMED_DORMANT_HARDPOINTS[0].shipIds).toEqual([GHOST_SHIP_ID])
  })

  it('the existing Center Ball Turret pattern (an unrelated component-owned independent-equipment port) remains fully functional', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace(GHOST_SHIP_ID)
    const centerInput = screen.getByLabelText('New target for Center Weapon') as HTMLInputElement
    selectFirstOption(centerInput, 'Ball Turret')
    // Confirms this Amendment's useFleetStore.ts change (relaxing the
    // factoryEntityClass requirement) did not disturb the pre-existing,
    // already-factory-real Ball Turret swap-and-synthesize flow.
    expect(centerInput.value).not.toBe('')
  })
})

/**
 * SW-013C.2G Amendment A — Production Path Differential Analysis.
 *
 * Commander operational validation found the Nose Turret never appears as
 * a selectable candidate in a real running dev server, despite every test
 * above passing. Root cause: every test above (and the original mission's
 * own live proof) adds the Ghost via `addFleetAsset('hornet-f7cs-mk2-imported', ...)`,
 * which materializes its Hardpoint rows through
 * `src/utils/fleetAssetMaterializer.ts`'s `materializeFleetAsset` — already
 * carrying `isDormant`/`dormantDonorShipEntityClass` onto each row.
 *
 * The Commander was instead looking at the pre-existing seed fixture
 * (`src/data/seed.ts`'s `id: 'ghost', name: 'F7C-S Hornet Ghost Mk II'`,
 * present by default whenever `VITE_SFM_DEV_SEED_FLEET=true` — the default
 * for this entire test suite per `vitest.setup.ts`, and evidently also the
 * Commander's own local dev server). That fixture's Hardpoint rows are
 * built by a THIRD, independent row-construction path —
 * `useFleetStore.ts`'s `buildCanonicalSeedCustomBuilds` — which duplicates
 * `materializeFleetAsset`'s row shape rather than reusing it, and had never
 * been updated to carry `isDormant`/`dormantDonorShipEntityClass` onto its
 * own rows. Without `isDormant`, `ShipWorkspacePrototype.tsx`'s
 * `configurableSlotFor` never takes its donor-ship swap-group fallback (the
 * port's own ship, `ghost`, never occupies `hardpoint_weapon_nose` for
 * real, so it has no entry of its own in
 * `configurable-slots.runtime.json`) — the port resolves as unconfigurable
 * and only "Intentional Empty" is ever offered. Fixed by adding the same
 * two-field passthrough already present in `materializeFleetAsset` and
 * `overlayCanonicalHierarchy` to this third path.
 */
describe('SW-013C.2G Amendment A: the seed "ghost" fixture (the Commander\'s actual production repro)', () => {
  it('the pre-existing seed Ghost ship (not a freshly-added asset) carries isDormant on its Nose Weapon row', () => {
    if (catalogComponentsByName.size === 0) return
    // Deliberately filtered to the CUSTOM build ('ghost-stealth', built by
    // useFleetStore.ts's buildCanonicalSeedCustomBuilds) rather than the
    // FACTORY build ('ghost-factory', built via materializeFleetAsset,
    // which already carried isDormant correctly before this Amendment).
    // An unfiltered `.find()` across all of this ship's builds would
    // silently match whichever row happens to come first in array order
    // and could pass even with the bug present — see SW-013C.2G Amendment
    // A's own report for how this exact ambiguity masked the bug in an
    // earlier draft of this test.
    const nose = useFleetStore.getState().hardpoints.find((h) => h.shipId === 'ghost' && h.buildId === 'ghost-stealth' && h.sourceItemPortName === 'hardpoint_weapon_nose')
    expect(nose).toBeDefined()
    expect(nose?.isDormant).toBe(true)
    expect(nose?.dormantDonorShipEntityClass).toBe('ANVL_Hornet_F7CM_Mk2')
  })

  it('the seed Ghost\'s Nose Weapon picker offers the confirmed turret candidates, not just Intentional Empty', () => {
    if (catalogComponentsByName.size === 0) return
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

    const noseInput = screen.getByLabelText('New target for Nose Weapon') as HTMLInputElement
    fireEvent.click(noseInput)
    const listboxId = noseInput.getAttribute('aria-controls')
    const options = Array.from(document.querySelectorAll(`#${listboxId} li`)).map((li) => li.textContent ?? '')
    // SW-013C.2G Amendment C: exactly one confirmed, vessel-compatible
    // turret — NOT just Intentional Empty, and NOT the excluded F7A/S3
    // swap-group member either.
    expect(options).toHaveLength(2)
    expect(options.some((o) => o.includes('Anvil Hornet Mk II S2 Nose Turret'))).toBe(true)
  })
})
