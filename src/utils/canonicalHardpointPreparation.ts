import type { FleetAsset, Hardpoint } from '../types'
import { shipFactoryTemplates } from '../data/shipDefinitions'
import { overlayCanonicalHierarchy, resolveShipDefinitionId } from './loadoutEditorModel'
import { withComponentOwnedChildSlots, type ComponentOwnedSlotSpec } from './componentOwnedSlots'

/**
 * SW-002 Revision A (Phase 1) — extracted verbatim from Ship Detail
 * (EWO-026/FTB-001B), which previously inlined this exact sequence. Moved
 * here so every consumer of "the canonical, authoritative port hierarchy
 * for this exact ship, overlaid with any saved Build's own values, with
 * component-owned missile/mining child slots synthesized" shares the ONE
 * implementation rather than each maintaining its own copy — Ship Detail
 * now calls this too (see its own updated comment).
 *
 * FTB-001A/FTB-001B/FTB-001E — a synthetic "<label> Slot N" row for
 * whichever component currently owns real child attachment ports (mining
 * heads, missile racks — see componentOwnedSlots.ts). Every component-
 * owned child slot is a REAL, non-structural, targetable port, sized to
 * its owner's own source-derived spec. It always starts empty (factory/
 * installed/target all '—') here — this row is freshly re-synthesized on
 * every call; the real persisted assignment (once one exists) is read
 * from the actual saved Hardpoint, not hardcoded — a swap must never
 * silently retain a previous, possibly now-incompatible assignment.
 */
export function makeHardpointChildSlotRow(host: Hardpoint, slotNumber: number, spec: ComponentOwnedSlotSpec): Hardpoint {
  const isMissileSlot = spec.label === 'Missile'
  return {
    ...host,
    id: `${host.id}-${spec.label.toLowerCase()}-slot-${slotNumber}`,
    slotLabel: `${host.slotLabel} — ${spec.label} Slot ${slotNumber}`,
    parentSlotLabel: host.slotLabel,
    isStructural: false,
    type: isMissileSlot ? 'Missile' : 'Mining Module',
    size: spec.size ? `S${spec.size}` : host.size,
    factoryItem: '—',
    installedItem: '—',
    targetItem: '—',
    status: 'OK',
    factoryEntityClass: undefined,
    installedEntityClass: undefined,
    targetEntityClass: undefined,
    invalidMessage: undefined,
  }
}

/**
 * The single "prepare this Build's saved hardpoints for display/
 * calculation" entry point (SW-002 Revision A, Phase 1). Overlays the
 * canonical ship template (resolveShipDefinitionId + shipFactoryTemplates)
 * onto the saved rows by stable slotLabel — reconciling any drift between
 * the ship's authoritative structure and what a saved Build happens to
 * carry — then synthesizes component-owned child slots. Every consumer
 * (Ship Detail, the Ship Management workspace) must call this rather than
 * reading `hardpoints.filter(h => h.buildId === X)` as the final UI
 * authority — raw store rows are the persisted, possibly-stale INPUT, not
 * what should ever reach calculateBuildProgress/buildPortTree/rendering.
 */
export function prepareCanonicalHardpoints(shipId: string, buildHardpoints: Hardpoint[], fleetAssets: FleetAsset[]): Hardpoint[] {
  const definitionId = resolveShipDefinitionId(shipId, fleetAssets)
  const canonicalTemplate = definitionId ? shipFactoryTemplates[definitionId] ?? [] : []
  return withComponentOwnedChildSlots(overlayCanonicalHierarchy(buildHardpoints, canonicalTemplate), makeHardpointChildSlotRow)
}
