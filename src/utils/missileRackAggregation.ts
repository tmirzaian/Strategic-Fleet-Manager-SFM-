import type { PortTreeNode } from './portTree'
import { componentOwnedChildSlotSpec, currentEntityClassOf, type ComponentOwnedSlotHost, type ComponentOwnedSlotSpec } from './componentOwnedSlots'
import type { Hardpoint } from '../types'

/**
 * EWO-054 (Chief Architect Amendment) — a missile rack's Commander-facing
 * aggregate: one row standing in for its N synthesized/materialized
 * "<rack> — Missile Slot N" children (see componentOwnedSlots.ts).
 * `quantity` always comes from the canonical component-owned slot spec
 * (never counted off however many rows happen to be present, never parsed
 * from the rack's display designation) — `countMismatch` is the one
 * integrity signal derived from row count, and it is only ever reported,
 * never used to silently pick a number.
 *
 * A rack supports exactly ONE selected missile identity across all of its
 * child slots — `inconsistent` is true when the children's current missile
 * identity (as read by the caller-supplied `getCurrentMissileIdentity`)
 * disagrees across slots: a genuinely different type per slot, or some
 * slots assigned and others still empty. This is never a supported target
 * configuration, only a legacy/imported state — true only until the
 * Commander picks one missile for the whole rack, which fans out to every
 * child identically (see MissionComposer.tsx's aggregate row onChange).
 */
export interface MissileAggregateMeta {
  quantity: number
  childSlotLabels: string[]
  countMismatch: boolean
  inconsistent: boolean
}

/**
 * EWO-054 — presentation-only fold, generic over the row shape (Ship
 * Detail's real `Hardpoint[]`, MissionComposer's `PreviewRow[]`), exactly
 * like `withComponentOwnedChildSlots` it sits downstream of. Collapses
 * every missile rack's real child slots (already correctly
 * synthesized/swapped/removed by `withComponentOwnedChildSlots` before this
 * ever runs) into one row built by the caller-supplied `makeAggregateRow`
 * factory — so each renderer produces a row shaped for its own type without
 * this module knowing anything about `PreviewRow`'s preview-only fields.
 *
 * Mining module children (`spec.label === 'Module'`) and every ordinary
 * port are returned completely untouched — this mission only concerns
 * missile racks. Never mutates or persists anything; safe to recompute on
 * every render, so a rack swap's new child set (or removal of an
 * incompatible one) is reflected immediately, with no separate
 * regeneration step required.
 */
export function withMissileRackAggregation<T extends ComponentOwnedSlotHost>(
  nodes: PortTreeNode<T>[],
  getCurrentMissileIdentity: (row: T) => string | undefined,
  makeAggregateRow: (parent: T, missileChildren: T[], spec: ComponentOwnedSlotSpec, meta: MissileAggregateMeta) => T
): PortTreeNode<T>[] {
  return nodes.map((node) => {
    const children = withMissileRackAggregation(node.children, getCurrentMissileIdentity, makeAggregateRow)

    if (node.hardpoint.isStructural) {
      return children === node.children ? node : { ...node, children }
    }

    const current = currentEntityClassOf(node.hardpoint)
    const spec = current ? componentOwnedChildSlotSpec(current) : null
    if (!spec || spec.label !== 'Missile') {
      return children === node.children ? node : { ...node, children }
    }

    const missileChildren = children.filter((c) => c.hardpoint.parentSlotLabel === node.hardpoint.slotLabel && !c.hardpoint.isStructural)
    if (missileChildren.length === 0) return { ...node, children }

    const identities = new Set(missileChildren.map((c) => getCurrentMissileIdentity(c.hardpoint) || '—'))
    const meta: MissileAggregateMeta = {
      quantity: spec.count,
      childSlotLabels: missileChildren.map((c) => c.hardpoint.slotLabel),
      countMismatch: missileChildren.length !== spec.count,
      inconsistent: identities.size > 1,
    }
    const aggregateHardpoint = makeAggregateRow(node.hardpoint, missileChildren.map((c) => c.hardpoint), spec, meta)
    const rest = children.filter((c) => !missileChildren.includes(c))
    return { ...node, children: [{ hardpoint: aggregateHardpoint, children: [] }, ...rest] }
  })
}

/** Fixed worst-first priority for collapsing several children's individual
 * statuses into the one aggregate row's own — an incompatible/unresolved
 * child must never be hidden behind sibling slots that happen to be fine. */
const STATUS_PRIORITY = ['Invalid Target', 'Unresolved', 'Missing', 'Upgrade Available', 'OK'] as const

export function worstStatus<S extends string>(statuses: S[]): S {
  for (const candidate of STATUS_PRIORITY) {
    const match = statuses.find((s) => s === candidate)
    if (match) return match
  }
  return statuses[0]
}

/** A value shared by every child, or `fallback` (e.g. "Mixed") when they
 * disagree — handles legacy per-slot-varied assignments saved before this
 * mission gracefully, rather than picking one arbitrarily. */
export function uniformOrFallback<V>(values: V[], fallback: V): V {
  const [first, ...rest] = values
  return rest.every((v) => v === first) ? first : fallback
}

/** SW-007D — the one extra, always-optional field a synthetic missile-rack
 * aggregate row carries; absent on every real persisted Hardpoint. Shared
 * by every Commander-facing presentation that renders real `Hardpoint[]`
 * (Ship Detail's LoadoutPortTree, Ship Workspace's Systems Workspace) —
 * MissionComposer's own preview rows carry additional preview-only fields
 * `Hardpoint` doesn't have, so it keeps its own `AggregatedPreviewRow`
 * shape and its own `makePreviewAggregateRow` factory; this one is only
 * for a real, already-persisted `Hardpoint`. */
export type DisplayHardpoint = Hardpoint & { missileAggregate?: MissileAggregateMeta }

/** SW-007D (originally EWO-054, Chief Architect Amendment) — collapses a
 * rack's real per-slot missile children (already correctly synthesized/
 * swapped by withComponentOwnedChildSlots upstream) into the one row a
 * Commander actually reasons about: a single missile type plus a
 * canonical quantity. A rack whose children currently disagree
 * (`meta.inconsistent` — genuinely different targets across slots, or
 * some assigned and others not) is never presented as if one of those
 * values were "the" answer: `targetItem` reads '—' and `status`/
 * `invalidMessage` are forced to 'Invalid Target' with an explanation,
 * regardless of what any individual child's own status says, so the
 * Commander sees a clear "needs one selection" state rather than an
 * arbitrary child's value being shown as though it were authoritative.
 * The single shared factory for every real-`Hardpoint` consumer of
 * `withMissileRackAggregation` — never reimplemented per page. */
export function makeMissileAggregateRow(parent: DisplayHardpoint, children: DisplayHardpoint[], spec: ComponentOwnedSlotSpec, meta: MissileAggregateMeta): DisplayHardpoint {
  return {
    ...parent,
    id: `${parent.id}-missile-aggregate`,
    slotLabel: `${parent.slotLabel} — Missile`,
    parentSlotLabel: parent.slotLabel,
    isStructural: false,
    type: 'Missile',
    size: spec.size ? `S${spec.size}` : parent.size,
    factoryItem: uniformOrFallback(children.map((c) => c.factoryItem), 'Mixed'),
    installedItem: uniformOrFallback(children.map((c) => c.installedItem), 'Mixed'),
    targetItem: meta.inconsistent ? '—' : uniformOrFallback(children.map((c) => c.targetItem), 'Mixed'),
    status: meta.inconsistent ? 'Invalid Target' : worstStatus(children.map((c) => c.status)),
    invalidMessage: meta.inconsistent
      ? `This rack's ${meta.quantity} missile slots do not currently share one missile type — select one missile to apply to all of them.`
      : children.find((c) => c.status === 'Invalid Target')?.invalidMessage,
    factoryEntityClass: undefined,
    installedEntityClass: undefined,
    targetEntityClass: undefined,
    missileAggregate: meta,
  }
}
