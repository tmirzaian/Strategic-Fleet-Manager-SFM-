import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ShipWorkspacePrototype from '../ShipWorkspacePrototype'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName, resolveComponentByEntityClass, resolveComponentByName } from '../../generated/componentCatalog'

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

function optionsFor(ariaLabel: string): string[] {
  const input = screen.getByLabelText(ariaLabel) as HTMLInputElement
  fireEvent.click(input)
  const listboxId = input.getAttribute('aria-controls')
  return Array.from(document.querySelectorAll(`#${listboxId} li`)).map((li) => li.textContent ?? '')
}

/**
 * SW-013C.2F Amendment A (Finding 2) — Missile Rack Compatibility Is Too
 * Broad. Root cause (confirmed via direct `dcb query` inspection of the
 * raw DataCore record): the Warlock's own rack ports carry no confirmed
 * swap group, so the generic size/category sweep was the only signal in
 * play — and it had no way to see that a same-size, same-category
 * candidate could still be authoritatively bound to another vessel.
 * DataCore's own `AttachDef.RequiredTags` field (never a name/entityClass
 * substring heuristic) is that authoritative signal: a non-empty value
 * means the item only genuinely attaches to a port carrying a matching
 * tag. `MRCK_S03_GAMA_Railen_Dual_S02` ("Gatac Missile Rack 2xS2") carries
 * `RequiredTags: "gama_railen"` — confirmed to be the Railen's own factory
 * rack, never legitimately available to the Warlock. The Warlock's own
 * factory rack, `MRCK_S03_BEHR_Dual_S02` ("MSD-322 Missile Rack"), carries
 * no RequiredTags at all — genuinely unrestricted.
 */
describe('SW-013C.2F Amendment A (Finding 2): vessel-specific missile racks no longer leak into the generic compatibility sweep', () => {
  it('the Warlock Left Missile Rack picker no longer offers the Railen-bound Gatac rack', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('avenger-warlock-imported')
    const options = optionsFor('New target for Left Missile Rack')
    const joined = options.join(' | ')
    expect(joined).not.toContain('Gatac')
    expect(joined).not.toContain('Railen')
  })

  it('the Warlock Left Missile Rack picker still offers its own genuinely unrestricted factory rack (MSD-322)', () => {
    if (catalogComponentsByName.size === 0) return
    renderShipWorkspace('avenger-warlock-imported')
    const options = optionsFor('New target for Left Missile Rack')
    expect(options.some((o) => o.startsWith('MSD-322 Missile Rack'))).toBe(true)
  })

  it('a same-name candidate split into vessel-bound/open shapes by vesselBoundTags resolves as ambiguous, not silently collapsed to whichever entityClass sorts first', () => {
    // "Vanduul S3 Quad Missile Rack" is shared by two real entityClasses,
    // identical category/size: MRCK_S03_VNCL_Quad_S01 (genuinely
    // unrestricted) and MRCK_S03_VNCL_Quad_S01_Blade (self-referentially
    // locked to the Vanduul Blade — Tags carries "$VNCL_Blade_Base",
    // RequiredTags "VNCL_Blade_Base"). Before this mission,
    // compatibilityShapeKey ignored vessel-binding entirely, so both
    // collapsed to one "resolved" candidate (whichever sorted first) —
    // capable of silently hiding the genuinely unrestricted one behind a
    // vessel-bound one for any caller resolving by name alone. See
    // src/generated/componentCatalog.ts's compatibilityShapeKey. (This is
    // the SAME shape of defect Finding 3 found for "MSD-313 Missile
    // Rack", where a now-stale hand-authored CATALOG override was masking
    // an equivalent real ambiguity — see src/data/componentCatalog.ts.)
    if (catalogComponentsByName.size === 0) return
    const resolution = resolveComponentByName('Vanduul S3 Quad Missile Rack')
    expect(resolution.status).toBe('ambiguous')
    if (resolution.status === 'ambiguous') {
      expect(resolution.candidates.some((c) => c.entityClass === 'MRCK_S03_VNCL_Quad_S01' && c.vesselBoundTags.length === 0)).toBe(true)
      expect(resolution.candidates.some((c) => c.entityClass === 'MRCK_S03_VNCL_Quad_S01_Blade' && c.vesselBoundTags.length > 0)).toBe(true)
    }
  })

  it('a vessel-bound entityClass is still authoritatively valid when it IS the confirmed candidate for a given entityClass-identified selection — the restriction only narrows generic-sweep SUGGESTIONS, never save-time validation', () => {
    // Confirms isComponentSelectableForPort's new gate did not leak into
    // checkCompatibility/validateTargetCompatibility (the save-time path):
    // the Railen's own rack must still resolve as a real, known component
    // by entityClass (catalog resolution itself is untouched).
    if (catalogComponentsByName.size === 0) return
    const resolution = resolveComponentByEntityClass('MRCK_S03_GAMA_Railen_Dual_S02')
    expect(resolution.status).toBe('resolved')
    if (resolution.status === 'resolved') {
      expect(resolution.record.vesselBoundTags).toEqual(['gama_railen'])
    }
  })

  it('MRCK_S03_BEHR_Dual_S02 (the Warlock\'s own rack) resolves with empty requiredTags — genuinely unrestricted', () => {
    if (catalogComponentsByName.size === 0) return
    const resolution = resolveComponentByEntityClass('MRCK_S03_BEHR_Dual_S02')
    expect(resolution.status).toBe('resolved')
    if (resolution.status === 'resolved') {
      expect(resolution.record.vesselBoundTags).toEqual([])
    }
  })
})
