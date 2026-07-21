import { getMiningModuleSlotCount } from '../generated/miningModuleSlots'
import { getMissileRackSlotSpec } from '../generated/missileRackSlots'

/**
 * FTB-001A/FTB-001B — a component-owned child slot's presentation shape:
 * how many, and (when the slot itself is size-constrained, e.g. a rack's
 * own missile attach points) what size. `label` is the word used in
 * "<label> Slot N" ("Module" for a mining head, "Missile" for a rack) —
 * sourced from whichever generated table produced this spec, so the
 * tree-construction step below never needs to know which kind of
 * component it's looking at.
 */
export interface ComponentOwnedSlotSpec {
  count: number
  /** The size a slot itself requires — a rack's own accepted missile
   * size, or (FTB-001H) a mining module slot's own fixed real size.
   * Always set now; every family that owns component-owned child slots
   * has a real, source-confirmed size of its own. */
  size?: number
  label: string
}

/** FTB-001H — every real Mining Module catalog record (all 28 currently
 * in generated-data/component-metadata-catalog.runtime.json, confirmed by
 * direct inspection) is size 1 — there is no such thing as an "S2 Mining
 * Module" anywhere in the real game data; a mining module's physical form
 * factor does not scale with the laser it's installed on (unlike a
 * missile rack, where the rack's own accepted missile size genuinely
 * varies — see `getMissileRackSlotSpec` below for that distinct case). */
const MINING_MODULE_SIZE = 1

/**
 * FTB-001A/FTB-001B/FTB-001H — the real, source-derived child-slot spec a
 * component (by entityClass) owns on its own DataCore record, regardless
 * of which physical ship port it happens to be installed into. Generic
 * over the data source: mining heads (generated-data/mining-module-slots.json)
 * and missile racks (generated-data/missile-rack-slots.json) both merge in
 * here; a future component-owned-slot category only needs its own lookup
 * added to this function, never a change to the tree-construction step
 * that consumes it. `null` when the entityClass owns no known child slots
 * at all (an ordinary component, or an uncataloged one) — never guessed.
 *
 * FTB-001H root cause: a mining slot previously carried no `size` of its
 * own, so every consumer's `spec.size ? ... : host.size` fallback (Loadout
 * Manager preview, Ship Detail, save-time reconciliation) inherited the
 * PARENT LASER's port size instead — correct only by coincidence for an
 * S1 laser (Prospector), wrong for any other size (the MOLE's S2 lasers,
 * confirmed the only currently-imported ship affected), silently
 * producing a "S2 Mining Module" requirement no real component can ever
 * satisfy. Mining slots now carry their own fixed, real size, exactly
 * like a missile rack's slot already carries its own real missile size —
 * neither family's slot size is ever again derived from its host port.
 */
export function componentOwnedChildSlotSpec(entityClass: string | null | undefined): ComponentOwnedSlotSpec | null {
  const miningCount = getMiningModuleSlotCount(entityClass)
  if (miningCount > 0) return { count: miningCount, size: MINING_MODULE_SIZE, label: 'Module' }

  const rackSpec = getMissileRackSlotSpec(entityClass)
  if (rackSpec) return { count: rackSpec.slotCount, size: rackSpec.missileSize, label: 'Missile' }

  return null
}

/** @deprecated kept only for the mining-specific unit tests that predate
 * the unified spec — prefer `componentOwnedChildSlotSpec`. */
export function componentOwnedChildSlotCount(entityClass: string | null | undefined): number {
  return componentOwnedChildSlotSpec(entityClass)?.count ?? 0
}

export interface ComponentOwnedSlotHost {
  id: string
  slotLabel: string
  parentSlotLabel?: string
  isStructural?: boolean
  installedEntityClass?: string
  targetEntityClass?: string
  factoryEntityClass?: string
  /** FTB-001B — MissionComposer's own live, not-yet-saved Target picker
   * selection (`PreviewRow.previewTargetEntityClass`) — absent entirely
   * on a real persisted `Hardpoint` (Ship Detail), present only while a
   * Commander is actively previewing a change in the Loadout Manager
   * before saving. */
  previewTargetEntityClass?: string
}

/**
 * FTB-001B — this row's "current, most concrete state" identity, for
 * deciding whether a component-owned child slot's owner has changed:
 *   1. `previewTargetEntityClass` — a live, not-yet-saved Loadout Manager
 *      picker selection, when present. This is the whole point of a
 *      preview: showing the effect of the Commander's pending choice
 *      immediately, before Save — "child-slot structure updates
 *      immediately" (FTB-001B's own required behavior) means reacting to
 *      this the moment it's picked, not only after it's installed.
 *   2. `installedEntityClass` — what's physically there right now, for a
 *      real persisted Hardpoint (Ship Detail) with no live preview in
 *      progress. Matches `computeHardpointStatusWithValidation`'s own
 *      "what's actually there right now" precedence (FTB-001A).
 *   3. `targetEntityClass`, then `factoryEntityClass` — the same
 *      permissive fallbacks FTB-001A already established for a port with
 *      nothing installed yet.
 */
function currentEntityClassOf(row: ComponentOwnedSlotHost): string | undefined {
  return row.previewTargetEntityClass ?? row.installedEntityClass ?? row.targetEntityClass ?? row.factoryEntityClass
}

/**
 * FTB-001A/FTB-001B — the one shared tree-correction step for
 * component-owned child slots, generic over BOTH:
 *   - a component that never had real ship-baked children to begin with
 *     (a mining head — FTB-001A) — always (re)synthesized fresh from the
 *     current identity's spec.
 *   - a component that DID have real ship-baked children reflecting
 *     whichever factory item was installed at ship-generation time (a
 *     missile rack — FTB-001B) — left completely untouched as long as
 *     the row's current identity still matches its factory identity (this
 *     is what preserves backward compatibility for every existing saved
 *     fleet/Loadout: nothing changes for a rack nobody ever swapped).
 *     Only once a Commander's Target/Installed selection genuinely
 *     diverges from Factory are the old (now-stale, possibly wrong-size)
 *     child rows removed and replaced with a fresh set derived from the
 *     NEWLY selected rack's own real spec.
 *
 * A row whose current identity has no known spec at all (an ordinary
 * component, or a swap to an uncataloged rack) never gains fabricated
 * children — if it had real factory children and got swapped away with
 * no known replacement spec, they are removed and nothing replaces them
 * (an honest "unknown structure" state, never a stale wrong-size one).
 *
 * Purely a display/calculation-time correction — never mutates or
 * persists anything; safe to call on every render, and therefore correct
 * again automatically after save, reload, or a full restart, since it
 * always re-derives from the row's own currently-persisted identity.
 *
 * EWO-053 (B12-RB-001) — `makeSlotRow` also receives `swapped`: whether
 * this parent's CURRENT identity differs from its own factory identity.
 * A caller building a row set that has no other source of previously-saved
 * per-slot data (a live, not-yet-persisted preview — see
 * src/pages/MissionComposer.tsx) needs this to decide whether an existing
 * saved assignment for a freshly-synthesized child slotLabel is still
 * valid to show as a default: valid when unswapped (the same real
 * component this assignment was made against), never carried forward when
 * swapped (a different component now occupies the parent slot, and its
 * own child slots start genuinely empty, exactly as they always have).
 * Every existing caller either ignores the extra argument (ShipDetail,
 * which reads real persisted rows directly and has no such concept) or
 * previously computed this exact boolean redundantly.
 */
export function withComponentOwnedChildSlots<T extends ComponentOwnedSlotHost>(rows: T[], makeSlotRow: (host: T, slotNumber: number, spec: ComponentOwnedSlotSpec, swapped: boolean) => T): T[] {
  const existingChildrenByParent = new Map<string, T[]>()
  for (const row of rows) {
    if (row.parentSlotLabel) {
      if (!existingChildrenByParent.has(row.parentSlotLabel)) existingChildrenByParent.set(row.parentSlotLabel, [])
      existingChildrenByParent.get(row.parentSlotLabel)!.push(row)
    }
  }

  const staleChildIds = new Set<string>()
  const newChildren: T[] = []

  for (const row of rows) {
    if (row.isStructural) continue
    const current = currentEntityClassOf(row)
    const swapped = Boolean(row.factoryEntityClass && current && current !== row.factoryEntityClass)
    const existingChildren = existingChildrenByParent.get(row.slotLabel) ?? []

    // Real ship-baked children for a rack nobody swapped — untouched.
    if (existingChildren.length > 0 && !swapped) continue

    // Swapped away from factory: whatever real children existed for the
    // OLD factory item are now stale (wrong count/size/identity) and must
    // never be silently retained.
    if (existingChildren.length > 0 && swapped) {
      for (const child of existingChildren) staleChildIds.add(child.id)
    }

    // (Re)synthesize when there were no real children to begin with (the
    // mining-head case, always), or when swapped away from factory (the
    // rack case) — in both cases, only when the CURRENT identity has a
    // known real spec. No spec known means no children at all, rather
    // than a guess.
    if (existingChildren.length === 0 || swapped) {
      const spec = componentOwnedChildSlotSpec(current)
      if (spec) {
        for (let slotNumber = 1; slotNumber <= spec.count; slotNumber++) {
          newChildren.push(makeSlotRow(row, slotNumber, spec, swapped))
        }
      }
    }
  }

  const filtered = staleChildIds.size > 0 ? rows.filter((r) => !staleChildIds.has(r.id)) : rows
  return newChildren.length > 0 ? [...filtered, ...newChildren] : filtered
}
