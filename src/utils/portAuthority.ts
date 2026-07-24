/**
 * Composite Port Authority Resolver (EWO-056C).
 *
 * Combines two independently-established facts — composite ownership
 * (`src/utils/portOwnership.ts`, EWO-056A) and authoritative DataCore
 * editability (`src/generated/componentOwnedPortConstraints.ts`,
 * EWO-055/EWO-056B) — into one deterministic answer: who controls a
 * port, and may SFM safely treat it as upgradeable. This module does
 * not re-derive either fact itself: ownership stays hierarchy-derived
 * (this file never walks a `parentId` chain), editability stays
 * DataCore-derived (this file never reads or parses
 * `generated-data/component-owned-port-constraints.json` directly, and
 * never re-implements `Flags` normalization — it calls
 * `getComponentOwnedPortConstraint` exactly as generated).
 *
 * UNKNOWN IS NOT PERMISSION. `mayEdit` is conservative by construction:
 * `true` only when ownership resolved AND a constraint record exists
 * AND that record's own `editable` is positively `true`. Every other
 * combination — locked, unknown, missing metadata, or ownership itself
 * failing to resolve — is `mayEdit: false`. The structured `reason` code
 * preserves WHY, because "locked," "unknown," and "missing metadata"
 * are meaningfully different states a later presentation layer may
 * eventually treat differently (a lock icon vs. a data-quality warning
 * vs. a malformed-hierarchy diagnostic) — none of that belongs to this
 * EWO. `reason` is an internal domain code for programmatic inspection
 * and tests, never Commander-facing copy.
 *
 * ARCHITECTURAL NOTE — HOST is upstream's decision, not this file's.
 * `classifyOwnership` (EWO-056A) still defines "no vehicle-attachment
 * boundary found in this node's ancestry" — including a broken/cyclic/
 * orphaned `parentId` chain, or an id it was never given — as
 * structurally `HOST`-shaped (`context.kind === 'HOST'`); this resolver
 * still consumes that `context` at face value and never re-traverses
 * ancestry to second-guess it (EWO-056C forbids re-traversal here).
 *
 * EWO-056C-R1 CORRECTION: the original EWO-056C design read `HOST` as
 * always-confirmed, which meant a broken/cyclic/orphaned ancestry chain
 * silently authorized editability interpretation as if it were a
 * genuinely confirmed host port — the exact "unknown converted into
 * permission" failure this module's own header explicitly forbids.
 * `classifyOwnership` now carries a `resolved: boolean` on every
 * `OwnershipResult`, independent of `kind`, distinguishing a positively
 * confirmed result (a boundary was found with a real owner, OR the walk
 * reached a genuine root with no boundary in between) from every
 * fallback. Precedence rule 1 below checks `ownership.resolved` FIRST —
 * before `context.kind` is read at all — so `ownershipScope: 'unresolved'`
 * now covers every case EWO-056C's own Unresolved-scope rule named
 * (missing node, broken ancestry, cycle, unresolved owner), not only the
 * one EWO-056A originally exposed structurally.
 *
 * No ship-specific behavior belongs here — this module never inspects
 * an id, name, or string beyond the exact fields `OwnershipContext`/
 * `PortConstraintRecord` already define, and never touches a display
 * label.
 */
import type { OwnershipResult } from './portOwnership'
import { getComponentOwnedPortConstraint } from '../generated/componentOwnedPortConstraints'

export type PortOwnershipScope = 'host' | 'attached-vehicle' | 'unresolved'

export type PortEditability = 'editable' | 'locked' | 'unknown'

export type PortAuthorityReason =
  | 'host-editable'
  | 'host-locked'
  | 'host-editability-unknown'
  | 'attached-vehicle-editable'
  | 'attached-vehicle-locked'
  | 'attached-vehicle-editability-unknown'
  | 'ownership-unresolved'
  | 'constraint-not-found'

export interface PortAuthority {
  readonly portId: string
  readonly ownerId: string | null
  readonly ownershipScope: PortOwnershipScope
  readonly editability: PortEditability
  /** True only when authoritative metadata positively confirms that the
   * port is editable. Conservative: every other case (locked, unknown,
   * missing constraint record, unresolved ownership) is `false`. */
  readonly mayEdit: boolean
  /** Stable reason intended for programmatic inspection and tests —
   * never Commander-facing display copy. */
  readonly reason: PortAuthorityReason
}

export interface ResolvePortAuthorityInput {
  /** The port's own stable identity, carried straight into the result —
   * never inspected for policy. */
  portId: string
  /** The ownership result already computed for this exact port by
   * `classifyOwnership`/`ownershipOf` (`src/utils/portOwnership.ts`) —
   * never re-derived here. */
  ownership: OwnershipResult
  /** The identity of whichever vehicle owns this port when ownership
   * resolves to `host` — the caller's own concept of "this Fleet
   * Asset"/ship id, not derived from `ownership` (the `HOST` ownership
   * context carries no identity of its own; see `portOwnership.ts`).
   * Omitted or empty simply means `ownerId: null` on a `host`-scoped
   * result — never fabricated. */
  hostVehicleId?: string | null
  /** The owning MOUNT/RACK/TURRET entity's own DataCore entityClass —
   * i.e. `Port.sourceEntityClass` of the exact port-container this port
   * sits on (e.g. `"DRAK_Command_Module_Remote_Turret_Tractor_Beam"`),
   * which is a real, canonical identifier and — for a port inside an
   * attached module — is NOT the same entityClass as the module's own
   * vehicle identity (`ownership`'s `ownerEntityClass`). This is the
   * exact key `getComponentOwnedPortConstraint` already expects; never
   * a display label, never a ship name. */
  entityClass: string | null | undefined
  /** This port's own raw DataCore port name on that owning entity's
   * record (e.g. `"turret_weapon"`) — `Port.internalName`, never
   * `displayName`. */
  portName: string | null | undefined
}

/**
 * Resolves one port's authority. Pure, deterministic, no mutation, no
 * global state, no React/persistence dependency. Precedence (explicit,
 * tested — never a truthiness check on `editable`):
 *
 *   1. Ownership unresolved -> `ownership-unresolved`, `mayEdit: false`.
 *   2. Constraint record missing -> `constraint-not-found`, `mayEdit: false`.
 *   3. `editable === false` -> locked, `mayEdit: false`.
 *   4. `editable === true`  -> editable, `mayEdit: true`.
 *   5. `editable === null`  -> unknown, `mayEdit: false`.
 */
export function resolvePortAuthority(input: ResolvePortAuthorityInput): PortAuthority {
  const { portId, ownership, hostVehicleId, entityClass, portName } = input

  // Precedence 1 (EWO-056C-R1) — `ownership.resolved` is checked FIRST,
  // before `context.kind` is trusted at all: a fallback HOST (broken
  // ancestry, a cycle, an unknown id — see `portOwnership.ts`'s own
  // `resolved` doc comment) is never treated as confirmed host
  // ownership here, exactly like an ATTACHED_MODULE boundary whose own
  // owner is unresolved. "SFM cannot establish which vehicle controls
  // the port," so editability is never even interpreted.
  if (!ownership.resolved) {
    return { portId, ownerId: null, ownershipScope: 'unresolved', editability: 'unknown', mayEdit: false, reason: 'ownership-unresolved' }
  }

  const ownershipScope: PortOwnershipScope = ownership.context.kind === 'HOST' ? 'host' : 'attached-vehicle'
  const ownerId: string | null = ownership.context.kind === 'HOST' ? (hostVehicleId ?? null) : ownership.context.ownerEntityClass

  const scopePrefix: 'host' | 'attached-vehicle' = ownershipScope
  const constraint = getComponentOwnedPortConstraint(entityClass, portName)

  // Precedence 2 — no authoritative record at all (uncataloged entity,
  // or a family this generator doesn't cover yet).
  if (!constraint) {
    return { portId, ownerId, ownershipScope, editability: 'unknown', mayEdit: false, reason: 'constraint-not-found' }
  }

  // Precedence 3/4/5 — explicit three-way switch on the tri-state
  // `editable` field. Never `if (constraint.editable)`.
  if (constraint.editable === false) {
    return { portId, ownerId, ownershipScope, editability: 'locked', mayEdit: false, reason: `${scopePrefix}-locked` }
  }
  if (constraint.editable === true) {
    return { portId, ownerId, ownershipScope, editability: 'editable', mayEdit: true, reason: `${scopePrefix}-editable` }
  }
  return { portId, ownerId, ownershipScope, editability: 'unknown', mayEdit: false, reason: `${scopePrefix}-editability-unknown` }
}

/**
 * Batch convenience over `resolvePortAuthority` — naturally useful since
 * every real caller (a future port-tree renderer) resolves authority for
 * many ports from one already-computed `classifyOwnership` result at
 * once, not one at a time. Adds no policy of its own.
 */
export function resolvePortAuthorities(inputs: ResolvePortAuthorityInput[]): PortAuthority[] {
  return inputs.map(resolvePortAuthority)
}
