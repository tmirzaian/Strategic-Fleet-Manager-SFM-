import type { Hardpoint, QuarantinedAssignment } from '../types'
import type { FactoryHardpointTemplate } from '../data/shipDefinitions'
import { computeHardpointStatusWithValidation } from './hardpointStatus'
// EWO-STAB-003D (ADR-010) — FactoryHardpointTemplate carries no
// entityClass of its own (see its own doc comment), so a reconciled row's
// factory identity must be resolved fresh here, exactly as
// fleetAssetMaterializer.ts already does for a brand-new Fleet Asset.
import { resolveComponentIdentity } from '../engine/installation'
import { componentOwnedChildSlotSpec } from './componentOwnedSlots'

export interface ReconciliationResult {
  /** The Build's full, current row set: matched old rows (Commander intent
   * preserved) plus any genuinely new template rows, in that order. */
  hardpoints: Hardpoint[]
  /** Old rows whose port no longer exists anywhere in the new template —
   * pulled out of the active/rendered set but never deleted (Task 7). */
  quarantined: QuarantinedAssignment[]
  /** Old slotLabel -> new slotLabel, for every matched row whose label
   * changed (e.g. an upstream rename/hierarchy change, Scenario D). The
   * caller uses this to migrate the ship's shared `installedLoadouts`
   * entries, which are themselves keyed by slotLabel. */
  slotLabelMigrations: Array<{ oldSlotLabel: string; newSlotLabel: string }>
}

/** The portion of a path-style slotLabel ("Parent — Child") after the last
 * separator — used to compare a row's own local name independent of its
 * parent's (possibly renamed) label. A label with no separator is its own
 * local label (a top-level or hand-authored seed row). */
function localLabel(slotLabel: string): string {
  const idx = slotLabel.lastIndexOf(' — ')
  return idx === -1 ? slotLabel : slotLabel.slice(idx + 3)
}

/**
 * EWO-043 (Task 1/5) — reconciles one Build's previously-persisted
 * Hardpoint rows against the CURRENT authoritative template for its ship.
 *
 * Match precedence, strongest first (Task 5) — a later tier is only ever
 * consulted for a row the earlier tiers left unmatched, and every tier
 * only accepts a candidate that is unambiguous, never a guess among
 * several equally-plausible siblings:
 *   1. `sourcePortId` — the stable canonical Port id, when both sides carry one.
 *   2. Parent hierarchy — once a row's own parent has already been matched
 *      (by any tier), look among that new parent's children for the same
 *      local label (the part of the label after the parent segment) and type.
 *      This is what lets a renamed parent (Scenario D) still resolve its
 *      children correctly even though the child's own full path-style
 *      label changed too.
 *   3. Exact slotLabel — the full label is unchanged (covers unparented/
 *      top-level rows whose own name didn't change).
 *   4. Same scope (matched parent, or top-level) + same type + same size,
 *      but only when exactly one unclaimed candidate exists in that scope.
 * Anything left unmatched is quarantined (Task 7) — removed from the
 * active row set, never deleted, fully recoverable.
 *
 * Factory data (factoryItem/type/size/slotLabel/sourcePortId/isStructural)
 * always comes from the NEW template row (Task 2 — Factory data is never
 * stale). `installedItem` is carried over from the matched old row as a
 * default (Task 3) — the store overlays the ship's authoritative
 * `installedLoadouts` record on top afterward, which is the true single
 * source of truth for "what's installed." `targetItem` is carried over
 * literally UNLESS the old row's `targetMode` is `FOLLOW_FACTORY`, in
 * which case it tracks the new factory item exactly like a Factory-kind
 * row would (Task 4 + Task 8) — an explicit Commander target is never
 * silently replaced; status is always recomputed against the NEW port
 * shape, so a target that's become incompatible is flagged, not left
 * showing a stale 'OK' (Task 4).
 *
 * Every new template row nothing old claims is a genuinely new port
 * (Task 6): materialized fresh, factory-current, Installed/Target empty.
 */
export function reconcileBuildHardpoints(
  shipId: string,
  buildId: string,
  oldHardpoints: Hardpoint[],
  newTemplate: FactoryHardpointTemplate[]
): ReconciliationResult {
  // FTB-001B/FTB-001E — a component-owned port's own children are a
  // dynamic structure (see componentOwnedSlots.ts), never part of the
  // static canonical template — the template only ever describes
  // whichever component shipped from the factory. Reconciling them the
  // normal way would silently revert any Commander-chosen swap back to
  // the ORIGINAL factory component's shape on every rehydration: the
  // template's own untouched child entries would never get
  // matched/`claimed` by the swapped-in children, so the "append
  // genuinely new port" step below would resurrect the OLD factory
  // children fresh, while the real, currently-saved children (a different
  // count/size entirely) never match anything and get quarantined. A
  // component-owned port (identified by the TEMPLATE's own factory
  // identity for it, regardless of what it's currently swapped to) has
  // its children excluded from matching entirely and carried straight
  // through from the old rows, verbatim — the exact structure
  // `saveMissionConfiguration` already computed correctly at save time —
  // and the template's own child entries for that same port are excluded
  // from ever being appended fresh. Generic over every family
  // `componentOwnedChildSlotSpec` recognizes (missile racks, mining
  // heads) — never gated to one label, so a future family gets this for
  // free. Deliberately NOT restricted to top-level (unparented) ports: a
  // missile rack always happens to be top-level, but a mining laser is
  // routinely nested under its own turret/mount housing (e.g. MOLE's
  // "Front Cab Mining Laser (Manned Turret) — Mining Weapon") — what
  // matters is the PORT's OWN factory identity, never its position in the
  // hierarchy.
  const componentOwnedParentSlotLabels = new Set(
    newTemplate.filter((t) => componentOwnedChildSlotSpec(t.factoryEntityClass) !== null).map((t) => t.slotLabel)
  )
  const isComponentOwnedChild = (parentSlotLabel: string | undefined) => parentSlotLabel !== undefined && componentOwnedParentSlotLabels.has(parentSlotLabel)
  const oldRackChildren = oldHardpoints.filter((h) => isComponentOwnedChild(h.parentSlotLabel))
  const oldHardpointsToReconcile = oldHardpoints.filter((h) => !isComponentOwnedChild(h.parentSlotLabel))
  const templateToReconcile = newTemplate.filter((t) => !isComponentOwnedChild(t.parentSlotLabel))

  const oldByLabel = new Map<string, Hardpoint>(oldHardpointsToReconcile.map((h) => [h.slotLabel, h]))
  const newBySourcePortId = new Map<string, FactoryHardpointTemplate>()
  const newBySlotLabel = new Map<string, FactoryHardpointTemplate>()
  const newChildrenByParent = new Map<string | undefined, FactoryHardpointTemplate[]>()
  for (const row of templateToReconcile) {
    if (row.sourcePortId) newBySourcePortId.set(row.sourcePortId, row)
    newBySlotLabel.set(row.slotLabel, row)
    const key = row.parentSlotLabel
    if (!newChildrenByParent.has(key)) newChildrenByParent.set(key, [])
    newChildrenByParent.get(key)!.push(row)
  }

  const claimed = new Set<FactoryHardpointTemplate>()
  const matchOf = new Map<string, FactoryHardpointTemplate>()

  // Tier 1 — sourcePortId.
  for (const old of oldHardpointsToReconcile) {
    if (old.sourcePortId) {
      const m = newBySourcePortId.get(old.sourcePortId)
      if (m && !claimed.has(m)) {
        matchOf.set(old.id, m)
        claimed.add(m)
      }
    }
  }

  // Tier 2 — parent hierarchy + local label + type. Iterated to a fixed
  // point so a chain of tier-2-only matches (parent resolved via tier 2
  // itself) still resolves top-down; real hierarchies are shallow (2-3
  // levels), so this converges in a handful of passes at most.
  let changed = true
  while (changed) {
    changed = false
    for (const old of oldHardpointsToReconcile) {
      if (matchOf.has(old.id) || !old.parentSlotLabel) continue
      const oldParent = oldByLabel.get(old.parentSlotLabel)
      const parentMatch = oldParent ? matchOf.get(oldParent.id) : undefined
      if (!parentMatch) continue
      const localOld = localLabel(old.slotLabel)
      const siblings = newChildrenByParent.get(parentMatch.slotLabel) ?? []
      const found = siblings.find((s) => !claimed.has(s) && localLabel(s.slotLabel) === localOld && s.type === old.type)
      if (found) {
        matchOf.set(old.id, found)
        claimed.add(found)
        changed = true
      }
    }
  }

  // Tier 3 — exact slotLabel (unparented/top-level rows whose name is unchanged).
  for (const old of oldHardpointsToReconcile) {
    if (matchOf.has(old.id)) continue
    const m = newBySlotLabel.get(old.slotLabel)
    if (m && !claimed.has(m)) {
      matchOf.set(old.id, m)
      claimed.add(m)
    }
  }

  // Tier 4 — same scope + type + size, only when unambiguous.
  for (const old of oldHardpointsToReconcile) {
    if (matchOf.has(old.id)) continue
    let scopeKey: string | undefined
    if (old.parentSlotLabel) {
      const oldParent = oldByLabel.get(old.parentSlotLabel)
      const parentMatch = oldParent ? matchOf.get(oldParent.id) : undefined
      if (!parentMatch) continue // parent itself unresolved — no safe scope to search
      scopeKey = parentMatch.slotLabel
    }
    const pool = newChildrenByParent.get(scopeKey) ?? []
    const candidates = pool.filter((s) => !claimed.has(s) && s.type === old.type && s.size === old.size)
    if (candidates.length === 1) {
      matchOf.set(old.id, candidates[0])
      claimed.add(candidates[0])
    }
  }

  const hardpoints: Hardpoint[] = []
  const quarantined: QuarantinedAssignment[] = []
  const slotLabelMigrations: Array<{ oldSlotLabel: string; newSlotLabel: string }> = []
  const now = new Date().toISOString()

  for (const old of oldHardpointsToReconcile) {
    const newRow = matchOf.get(old.id)
    if (!newRow) {
      quarantined.push({ id: `quarantine-${old.id}-${Date.now()}`, shipId, buildId, hardpoint: old, reason: 'PORT_REMOVED', quarantinedAt: now })
      continue
    }
    if (newRow.slotLabel !== old.slotLabel) {
      slotLabelMigrations.push({ oldSlotLabel: old.slotLabel, newSlotLabel: newRow.slotLabel })
    }
    const followsFactory = old.targetMode === 'FOLLOW_FACTORY'
    const targetItem = newRow.isStructural ? '—' : followsFactory ? newRow.factoryItem : old.targetItem
    const installedItem = newRow.isStructural ? '—' : old.installedItem
    // EWO-STAB-003D (ADR-010) — factory identity resolved fresh when the
    // template itself carries none; installed/target identity preserved
    // from the OLD row (never re-derived from the new template), since
    // installedItem/targetItem above are themselves still old's own
    // values in the non-FOLLOW_FACTORY case.
    // EWO-STAB-004A — `newRow.factoryEntityClass` (now populated for every
    // deep-imported ship's template — see FactoryHardpointTemplate's own
    // doc comment) is preferred: it is the exact entityClass the import
    // pipeline already resolved, not a re-derivation from display-name
    // text that can be genuinely ambiguous (e.g. `M2C "Swarm"`).
    const factoryEntityClass = newRow.isStructural
      ? undefined
      : (newRow.factoryEntityClass ?? resolveComponentIdentity({ displayName: newRow.factoryItem })?.entityClass ?? undefined)
    const installedEntityClass = newRow.isStructural ? undefined : old.installedEntityClass
    const targetEntityClass = newRow.isStructural ? undefined : followsFactory ? factoryEntityClass : old.targetEntityClass
    const { status, invalidMessage } = newRow.isStructural
      ? { status: 'OK' as const, invalidMessage: undefined }
      : computeHardpointStatusWithValidation(installedItem, targetItem, newRow.factoryItem, newRow.type, newRow.size, {
          installedEntityClass,
          targetEntityClass,
          factoryEntityClass,
        })
    hardpoints.push({
      id: old.id,
      shipId,
      buildId,
      slotLabel: newRow.slotLabel,
      type: newRow.type,
      size: newRow.size,
      factoryItem: newRow.isStructural ? '—' : newRow.factoryItem,
      installedItem,
      targetItem,
      factoryEntityClass,
      installedEntityClass,
      targetEntityClass,
      status,
      invalidMessage,
      parentSlotLabel: newRow.parentSlotLabel,
      groupLabel: newRow.groupLabel,
      assemblyRole: newRow.assemblyRole,
      isStructural: newRow.isStructural,
      sourcePortId: newRow.sourcePortId,
      targetMode: old.targetMode,
    })
  }

  let freshIndex = 0
  for (const newRow of templateToReconcile) {
    if (claimed.has(newRow)) continue
    // EWO-STAB-004A — same preference as the matched-row branch above.
    const factoryEntityClass = newRow.isStructural
      ? undefined
      : (newRow.factoryEntityClass ?? resolveComponentIdentity({ displayName: newRow.factoryItem })?.entityClass ?? undefined)
    const { status, invalidMessage } = newRow.isStructural
      ? { status: 'OK' as const, invalidMessage: undefined }
      : computeHardpointStatusWithValidation('—', '—', newRow.factoryItem, newRow.type, newRow.size, { factoryEntityClass })
    hardpoints.push({
      id: `${buildId}-hp-new-${freshIndex++}`,
      shipId,
      buildId,
      slotLabel: newRow.slotLabel,
      type: newRow.type,
      size: newRow.size,
      factoryItem: newRow.isStructural ? '—' : newRow.factoryItem,
      installedItem: newRow.isStructural ? '—' : '—',
      targetItem: newRow.isStructural ? '—' : '—',
      factoryEntityClass,
      status,
      invalidMessage,
      parentSlotLabel: newRow.parentSlotLabel,
      groupLabel: newRow.groupLabel,
      assemblyRole: newRow.assemblyRole,
      isStructural: newRow.isStructural,
      sourcePortId: newRow.sourcePortId,
      targetMode: 'FOLLOW_FACTORY',
    })
  }

  // A rack port's own children are carried straight through, completely
  // unchanged — see this function's own doc comment above for why they're
  // deliberately excluded from every tier of matching/quarantine/fresh-
  // append above.
  hardpoints.push(...oldRackChildren)

  return { hardpoints, quarantined, slotLabelMigrations }
}
