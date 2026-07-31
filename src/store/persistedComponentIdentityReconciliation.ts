import { resolveComponentCatalogEntryDetailed } from '../data/componentCatalog'
import type { Hardpoint, InstalledLoadoutEntry, HangarItem, MissionReservation } from '../types'

/**
 * EWO-084 — closes Engineering Risk Register item R-004 ("Persisted
 * Component Reference Drift"). `useFleetStore.ts`'s persisted-record
 * validators check record SHAPE only (`isValidPersistedHardpoint` etc.)
 * and never re-resolve a component name/entityClass against the current
 * catalog — confirmed by direct inspection during this mission's own
 * pre-implementation review. This module is the narrowly-scoped
 * reconciliation layer that closes that gap, applied from
 * `useFleetStore.ts`'s `merge` at each point a genuinely-persisted array
 * is read (see the call sites there for why `merge`, not `migrate`, is
 * the right hook — `migrate` only runs once, for a version transition;
 * `merge` runs on every load with persisted state, which is what R-004
 * actually requires).
 *
 * Scope, deliberately narrow (EWO-084's own Safety Constraints):
 *   - Applied ONLY to arrays that came from genuine persisted storage
 *     (`persisted?.hangarItems`, `persisted?.installedLoadouts`,
 *     `persisted?.reservations`, and the persisted custom-Build hardpoint
 *     rows) — never to the freshly-rebuilt-every-load seed baseline. See
 *     `reconcileArray`'s own doc comment below for the real regression
 *     this boundary exists to prevent.
 *   - Touches ONLY the optional `*EntityClass`/`entityClass`/
 *     `componentEntityClass` fields already documented throughout this
 *     codebase as "additive," "derived," "never used for display" (see
 *     each field's own doc comment in src/types/index.ts). These are
 *     catalog-derived identity metadata, not Commander input.
 *   - NEVER touches the Commander-facing name/string fields these
 *     metadata fields sit alongside (`installedItem`, `targetItem`,
 *     `factoryItem`, `componentName`, `HangarItem.name`) — EWO-084's own
 *     Requirement 8 explicitly protects target assignments, reservations,
 *     and custom names as Commander-owned state. A drifted name (wrong
 *     case, stray whitespace) therefore stays exactly as the Commander
 *     or seed author typed it; what changes is only whether the HIDDEN
 *     entityClass linkage can now find the real catalog record despite
 *     that drift — which is what actually fixes the R-004 defect class
 *     (a duplicate/unclassified selector entry), since every
 *     entityClass-aware comparison in this codebase
 *     (`identitiesMatch`/`calculateComponentAvailability`/compatibility
 *     checks) prefers entityClass over name the instant one is present.
 *   - NEVER overwrites an EXISTING entityClass. Only ever populates one
 *     that's currently absent. An entityClass that no longer resolves in
 *     today's catalog is left exactly as it is — there is no positive
 *     signal for what it should become, and guessing is explicitly
 *     forbidden (Requirement 5/6/7: never fabricate, never coerce into
 *     an unrelated entry, never silently choose between candidates).
 *   - Resolution is strict (`onAmbiguous: 'strict'`) and uses
 *     `skipCatalogOverride: true` — the hand-authored CATALOG override
 *     table (src/data/componentCatalog.ts) exists for compatibility
 *     corrections and carries no grade/manufacturerCode/classification
 *     by construction; routing identity reconciliation through it would
 *     silently block resolution for any name matching an override key
 *     (the same class of regression EWO-083 already found and reverted
 *     for `resolveGrade` — see that mission's own commit message).
 *   - Uses ONLY `resolveComponentCatalogEntryDetailed` (EWO-083's
 *     canonical resolver, widened with exactly the options this needs —
 *     trimming, case-insensitive fallback, ambiguity mode). No second
 *     lookup chain, no reimplemented catalog map traversal, no local
 *     case-folding.
 *   - Deterministic and idempotent by construction: a pure function of
 *     the record's own existing fields plus the (unchanging within one
 *     session) generated catalog. Hydrating the same persisted state
 *     twice reconciles to the exact same result; a record that needed no
 *     reconciliation returns the SAME object reference (not a shallow
 *     copy), so an unaffected record is never treated as "changed" and
 *     an unaffected array is never rebuilt with a new reference — no
 *     unnecessary persistence churn (Requirement 11).
 *   - Not force-written back to localStorage — nothing in this module
 *     calls `set()` or otherwise triggers an immediate save. Reconciled
 *     values live in the freshly-hydrated in-memory state and are
 *     persisted the ordinary way, the next time any real store action
 *     saves (which happens routinely). This mirrors the existing
 *     `normalizeFleetPriorities` self-heal (EWO-066 Part G), which runs
 *     on every hydration the same way, with no forced re-save and no
 *     persisted-schema version bump.
 *
 * Explicitly out of scope (documented, not silently skipped):
 *   - `QuarantinedAssignment.hardpoint` — a frozen historical snapshot of
 *     a port that disappeared upstream, not a live record any current
 *     readiness/compatibility/procurement calculation reads. Reconciling
 *     it would add real surface area for no live behavioral benefit.
 *   - Any field other than the entity-class metadata fields listed above
 *     — no readiness, quantity, disposition, status, or note field is
 *     ever touched here.
 */

const NO_ITEM_SENTINEL = '—'

/**
 * Given a persisted component name and its current (possibly absent)
 * entityClass, returns the entityClass to keep: the existing value if
 * already present (never second-guessed), or a freshly-resolved one when
 * the name confidently resolves against the canonical catalog despite
 * whitespace or case-only drift, or the existing (absent) value
 * unchanged when the name is genuinely uncataloged or ambiguous.
 */
function reconcileEntityClass(name: string, existingEntityClass: string | undefined): string | undefined {
  if (existingEntityClass) return existingEntityClass
  const trimmed = name.trim()
  if (!trimmed || trimmed === NO_ITEM_SENTINEL) return existingEntityClass

  const resolution = resolveComponentCatalogEntryDetailed(name, undefined, {
    skipCatalogOverride: true,
    caseInsensitiveFallback: true,
    onAmbiguous: 'strict',
  })
  if (resolution.status === 'resolved' && resolution.entry.entityClass) {
    return resolution.entry.entityClass
  }
  return existingEntityClass
}

/** Reconciles a single Hardpoint's three identity fields
 * (factory/installed/target). Returns the SAME object reference when
 * none of the three needed reconciliation. */
export function reconcileHardpointComponentIdentity(hardpoint: Hardpoint): Hardpoint {
  const factoryEntityClass = reconcileEntityClass(hardpoint.factoryItem, hardpoint.factoryEntityClass)
  const installedEntityClass = reconcileEntityClass(hardpoint.installedItem, hardpoint.installedEntityClass)
  const targetEntityClass = reconcileEntityClass(hardpoint.targetItem, hardpoint.targetEntityClass)
  if (
    factoryEntityClass === hardpoint.factoryEntityClass &&
    installedEntityClass === hardpoint.installedEntityClass &&
    targetEntityClass === hardpoint.targetEntityClass
  ) {
    return hardpoint
  }
  return { ...hardpoint, factoryEntityClass, installedEntityClass, targetEntityClass }
}

/** Reconciles the shared Installed Loadout record's identity field — the
 * authoritative "what's physically installed" source every rendered
 * Hardpoint row's own installedEntityClass is overlaid from. Returns the
 * SAME object reference when no reconciliation was needed. */
export function reconcileInstalledLoadoutEntryIdentity(entry: InstalledLoadoutEntry): InstalledLoadoutEntry {
  const entityClass = reconcileEntityClass(entry.installedItem, entry.entityClass)
  if (entityClass === entry.entityClass) return entry
  return { ...entry, entityClass }
}

/** Reconciles a Hangar Inventory record's identity field. Returns the
 * SAME object reference when no reconciliation was needed. */
export function reconcileHangarItemIdentity(item: HangarItem): HangarItem {
  const entityClass = reconcileEntityClass(item.name, item.entityClass)
  if (entityClass === item.entityClass) return item
  return { ...item, entityClass }
}

/** Reconciles a Mission Reservation's identity field. Returns the SAME
 * object reference when no reconciliation was needed. */
export function reconcileReservationIdentity(reservation: MissionReservation): MissionReservation {
  const componentEntityClass = reconcileEntityClass(reservation.componentName, reservation.componentEntityClass)
  if (componentEntityClass === reservation.componentEntityClass) return reservation
  return { ...reservation, componentEntityClass }
}

/**
 * Maps `reconcileOne` over `items`, returning the SAME array reference
 * when every element reconciled to itself — the array-level half of the
 * "no unnecessary persistence churn" guarantee (Requirement 11).
 *
 * Callers (see `useFleetStore.ts`'s `merge`) apply this ONLY to arrays
 * that came from genuinely persisted storage (`persisted?.X`), never to
 * the freshly-rebuilt-every-load seed baseline. The seed baseline is
 * regenerated verbatim from `src/data/seed.ts` on every hydration — it
 * isn't "persisted state that can drift" in R-004's sense, and reconciling
 * it introduces its own real regression: `addHangarItem`'s merge
 * precedence treats "exactly one side carries entityClass" as "never the
 * same record" (see that action's own doc comment), so retroactively
 * giving a previously-entityClass-less seed baseline record a fresh
 * entityClass changes how a Commander's SAME-SESSION additions of that
 * exact item merge against it — confirmed as a real regression during
 * this mission's own test pass, not a hypothetical one. A seed.ts data
 * bug (the historical "Snowblind" example) is fixed at the source, the
 * same way it already was; this module's job is real Commander-saved
 * data drift, nothing the app itself regenerates fresh every load.
 */
export function reconcileArray<T>(items: T[], reconcileOne: (item: T) => T): T[] {
  let changed = false
  const next = items.map((item) => {
    const reconciled = reconcileOne(item)
    if (reconciled !== item) changed = true
    return reconciled
  })
  return changed ? next : items
}
