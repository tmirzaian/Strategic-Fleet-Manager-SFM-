/**
 * Composite Vehicle Ownership Classification Engine (EWO-056A, amended
 * EWO-056C-R1).
 *
 * ARCHITECTURE NOTES
 * ===================
 *
 * Background (EWO-056 investigation): the Ironclad Assault's Loadout
 * Manager presents both its own systems and its attached Command
 * Module's systems in one combined hierarchy, with no ownership boundary
 * exposed anywhere. Tracing the real imported data
 * (`generated-data/ports.json`, sourced from `raw-data/DRAK_Ironclad_Assault.json`)
 * found that DataCore already draws this boundary authoritatively — it
 * was simply never read:
 *
 *   hardpoint_docking_module (host's own docking port, isStructural)
 *     itemport_vehicle_attach (sourceEntityClass: "DRAK_Command_Module")
 *       hardpoint_armor, hardpoint_quantum_drive, hardpoint_tractor_beam, ...
 *
 * `itemport_vehicle_attach` is the only port in this codebase's entire
 * imported fleet that does not follow the universal `hardpoint_*` naming
 * convention, and every one of its descendants' `sourceEntityClass`
 * traces to `DRAK_Command_Module` — a fully independent entity
 * confirmed (EWO-056 spike) to carry its own `VehicleComponentParams`
 * and its own `SEntityInsuranceProperties.shipInsuranceParams`, i.e. a
 * real vehicle in DataCore's own terms, not a component. Confirmed
 * reused byte-identically across all four currently-imported
 * Command-Module-capable hosts (Ironclad, Ironclad Assault, Caterpillar,
 * Caterpillar Pirate) — see this module's own test suite.
 *
 * ownership derivation
 * ---------------------
 * `classifyOwnership` walks each node's ANCESTRY (via `parentId`, an
 * authoritative structural link — never a display string) looking for
 * the nearest ancestor (inclusive of the node itself) whose own
 * `internalName` — the raw, non-presentational DataCore port
 * identifier, never `displayName` — appears in `VEHICLE_ATTACHMENT_PORT_NAMES`.
 * Found: every node from that boundary downward is `ATTACHED_MODULE`,
 * carrying the boundary's own `sourceEntityClass` as `ownerEntityClass`.
 * Not found, because the walk genuinely reached a true root (no
 * `parentId` at all): `HOST`, confirmed. This is the entire algorithm;
 * nothing here is Ironclad-specific, ship-specific, or name-substring-
 * based — the Chief Architect's directive ("if the implementation
 * cannot naturally support the next composite vehicle without adding
 * ship-specific logic, stop and revisit") is met by construction: a
 * future composite vehicle whose own DataCore record uses a different
 * attachment port name needs exactly one addition to
 * `VEHICLE_ATTACHMENT_PORT_NAMES` and nothing else in this file changes.
 *
 * EWO-056C-R1 — resolution confidence
 * -------------------------------------
 * The original EWO-056A design collapsed every ancestry-walk failure
 * (a broken `parentId` reference, a cyclic chain, an id this engine was
 * never given) into the SAME plain `HOST` result a genuinely-confirmed
 * host port gets — "unknown attachment styles shall safely default to
 * HOST" was correct for classification (it never crashes, never
 * misclassifies as ATTACHED_MODULE), but it silently discarded the
 * distinction between "we positively confirmed this port belongs to the
 * host" and "we could not determine ownership at all, so we fell back."
 * `resolvePortAuthority` (`src/utils/portAuthority.ts`) needs exactly
 * that distinction — "ownership cannot be resolved" must never be
 * treated as "confirmed host, therefore safe to interpret editability
 * for." Every `OwnershipResult` now carries `resolved: boolean`
 * alongside `context`/`reason`:
 *   - `resolved: true` + `kind: 'HOST'` — the walk reached a genuine
 *     root (no `parentId` at all) with no boundary anywhere in between.
 *   - `resolved: true` + `kind: 'ATTACHED_MODULE'` — a boundary was
 *     found AND its own `ownerEntityClass` resolved to a real value.
 *   - `resolved: false` — anything the walk could not positively
 *     confirm: a broken `parentId` reference, a cyclic chain, a
 *     boundary whose own owning entity is itself unresolved, or an id
 *     this engine was never given at all (`ownershipOf` on an unknown
 *     id). `context.kind` is always `'HOST'` in this case (there is
 *     nothing more specific to report), but callers MUST check
 *     `resolved` before trusting `kind` — see `portAuthority.ts`'s own
 *     precedence rule 1.
 *
 * hierarchy preservation
 * ------------------------
 * This module never mutates its input and never removes, reparents, or
 * synthesizes a node — it only ever produces a side table (`Map<id,
 * OwnershipResult>`) keyed by the caller's own existing ids. Exactly
 * like `withMissileRackAggregation`/`withComponentOwnedChildSlots`
 * before it, ownership is DERIVED at query/render time from fields the
 * pipeline already authoritatively carries (`internalName`,
 * `sourceEntityClass`, `parentId`) — never persisted onto a saved Build,
 * never written back into `generated-data/*.json`, never requiring a
 * materialization change. Nothing in this module is wired into any
 * consumer yet (EWO-056A/EWO-056C are architecture only) — see this
 * file's own test suite and `src/utils/portAuthority.ts` for the only
 * current callers.
 *
 * extension strategy
 * --------------------
 * `OwnershipContext` is an open discriminated union; this mission only
 * ever constructs `HOST`/`ATTACHED_MODULE`. A future ownership kind
 * (e.g. a maintenance-only sub-assembly, a rented module with its own
 * authority rules) is added by (1) extending the union with a new
 * variant carrying whatever data that kind needs, and (2) giving the
 * boundary check a second, independent marker table/predicate for it —
 * the ancestry-walk in `classifyOwnership` itself is generic over "the
 * nearest ancestor matching ANY known boundary kind wins" and does not
 * need to change shape to support a second kind. `resolved` composes
 * with any future kind unchanged.
 */

/** The minimal, decoupled node shape this engine needs — never the real
 * `Port`/`Hardpoint`/`FactoryHardpointTemplate` type directly, so any of
 * them (or a future shape) can be adapted into it at the call site
 * without this module depending on any of theirs. `internalName` is the
 * raw DataCore port identifier (`Port.internalName`) — NEVER a
 * `displayName`, NEVER a ship/hull name. `sourceEntityClass` is the raw
 * entity class mounted at this exact node (`Port.sourceEntityClass`) —
 * diagnostic identity only, per that field's own established meaning
 * elsewhere in this codebase (see `src/engine/types/port.ts`). */
export interface OwnershipNode {
  id: string
  parentId?: string | null
  internalName?: string | null
  sourceEntityClass?: string | null
}

/**
 * The set of raw DataCore port `internalName`s confirmed (EWO-056) to
 * mark the entry point of a fully independent, dockable vehicle/module
 * attached to a host ship. Never a ship name, entity name, or display
 * label — a raw port-naming-convention fact, the same category of
 * evidence `assemblyRole.ts` already reasons from elsewhere in this
 * codebase. Extending ownership classification to a future composite
 * vehicle whose real DataCore port uses a different raw name requires
 * only adding that name here.
 */
const VEHICLE_ATTACHMENT_PORT_NAMES: ReadonlySet<string> = new Set(['itemport_vehicle_attach'])

export type OwnershipContext =
  | { readonly kind: 'HOST' }
  | {
      readonly kind: 'ATTACHED_MODULE'
      /** The id of the boundary node itself (the attachment port) — the
       * node this ownership was determined FROM, never guessed. */
      readonly boundaryNodeId: string
      /** The raw port `internalName` that matched (e.g.
       * "itemport_vehicle_attach") — how ownership was determined. */
      readonly boundaryPortName: string
      /** The attached vehicle's own entityClass (e.g.
       * "DRAK_Command_Module"), read directly from the boundary node's
       * own `sourceEntityClass` — `null` when that field itself is
       * unresolved on the source data, never fabricated. When `null`,
       * `resolved` on the enclosing `OwnershipResult` is always `false`
       * (EWO-056C-R1) — a boundary with no confirmed owner is not a
       * confirmed `ATTACHED_MODULE` result. */
      readonly ownerEntityClass: string | null
    }

export interface OwnershipResult {
  readonly context: OwnershipContext
  /** EWO-056C-R1 — `true` only when this result reflects a positively
   * confirmed structural fact (see this module's own header comment for
   * the exact rule per `context.kind`). `false` for every fallback: a
   * broken `parentId` reference, a cyclic chain, a boundary whose own
   * owning entity is unresolved, or an id never given to
   * `classifyOwnership` at all. Callers must treat `resolved: false` as
   * "ownership could not be determined" — never as confirmed host. */
  readonly resolved: boolean
  /** Human-readable trace of how this result was reached — "answers how
   * ownership was determined" without the caller needing to re-derive
   * it from `context` itself. */
  readonly reason: string
}

const CONFIRMED_HOST_RESULT: OwnershipResult = {
  context: { kind: 'HOST' },
  resolved: true,
  reason: 'ancestry walk reached a genuine root (no parentId) with no vehicle-attachment boundary found in between — confirmed host',
}

const UNKNOWN_ID_RESULT: OwnershipResult = {
  context: { kind: 'HOST' },
  resolved: false,
  reason: 'this id was never given to classifyOwnership — ownership cannot be determined for an unknown port id',
}

function unresolvedHost(reason: string): OwnershipResult {
  return { context: { kind: 'HOST' }, resolved: false, reason }
}

/**
 * Classifies every node's ownership by walking its ancestry (via
 * `parentId`) for the nearest boundary match, inclusive of the node
 * itself. Pure and read-only: never mutates `nodes`, never reorders or
 * drops anything — returns a side table keyed by the caller's own `id`s.
 *
 * Cycle-safe and orphan-safe — never hangs, never throws — but
 * (EWO-056C-R1) a cyclic chain or a `parentId` pointing at an id absent
 * from `nodes` no longer silently reads as confirmed `HOST`: both
 * produce `resolved: false`, distinguishable from a genuinely confirmed
 * host by that flag alone.
 */
export function classifyOwnership<T extends OwnershipNode>(nodes: readonly T[]): Map<string, OwnershipResult> {
  const byId = new Map<string, T>()
  for (const node of nodes) byId.set(node.id, node)

  const results = new Map<string, OwnershipResult>()

  function resolve(node: T): OwnershipResult {
    const cached = results.get(node.id)
    if (cached) return cached

    const visited = new Set<string>()
    let current: T | undefined = node

    while (current) {
      if (visited.has(current.id)) {
        const result = unresolvedHost(`cyclic parentId chain detected at node "${current.id}" — ownership cannot be confirmed`)
        for (const visitedId of visited) results.set(visitedId, result)
        return result
      }
      visited.add(current.id)

      if (current.internalName && VEHICLE_ATTACHMENT_PORT_NAMES.has(current.internalName)) {
        const ownerEntityClass = current.sourceEntityClass ?? null
        const resolved = ownerEntityClass !== null
        const result: OwnershipResult = {
          context: { kind: 'ATTACHED_MODULE', boundaryNodeId: current.id, boundaryPortName: current.internalName, ownerEntityClass },
          resolved,
          reason: resolved
            ? `descends from boundary port "${current.internalName}" (node ${current.id}), owned by entityClass ${ownerEntityClass}`
            : `descends from boundary port "${current.internalName}" (node ${current.id}), but its own owning entityClass is unresolved`,
        }
        for (const visitedId of visited) results.set(visitedId, result)
        return result
      }

      const parentId: string | null | undefined = current.parentId
      if (!parentId) {
        // A genuine root — no parentId at all — with no boundary found
        // anywhere in this walk: confirmed host.
        for (const visitedId of visited) results.set(visitedId, CONFIRMED_HOST_RESULT)
        return CONFIRMED_HOST_RESULT
      }

      const parent = byId.get(parentId)
      if (!parent) {
        const result = unresolvedHost(`parentId "${parentId}" (referenced from node "${current.id}") is absent from the given node set — broken ancestry, ownership cannot be confirmed`)
        for (const visitedId of visited) results.set(visitedId, result)
        return result
      }
      current = parent
    }

    // Unreachable — every branch above returns — kept only to satisfy
    // the compiler's control-flow analysis.
    return CONFIRMED_HOST_RESULT
  }

  for (const node of nodes) resolve(node)
  return results
}

/** Convenience accessor — `classifyOwnership` already computes every
 * node's result in one pass; this just reads one back by id. An id this
 * engine was never given (EWO-056C-R1: "unknown port ID") resolves to
 * `UNKNOWN_ID_RESULT` — `resolved: false` — never a silently-confirmed
 * `HOST`, and never throws. */
export function ownershipOf(results: Map<string, OwnershipResult>, id: string): OwnershipResult {
  return results.get(id) ?? UNKNOWN_ID_RESULT
}
