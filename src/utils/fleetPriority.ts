/**
 * EWO-066 (Part E/G) — Fleet Priority as a unique manual ranking: every
 * assigned priority is a distinct positive integer with no gaps (1..N),
 * or a ship carries none at all ("Unprioritized," `null`). This is the
 * one place both a Commander-initiated re-rank (`reorderFleetPriority`)
 * and the read-path self-heal (`normalizeFleetPriorities`) compute the
 * resulting rank set — `useFleetStore.ts` only ever applies whatever
 * these return, never computes ranks itself, so the invariant can never
 * silently drift between the two call sites.
 */

export interface PriorityAssignment {
  id: string
  priority: number | null
}

/** Null-safe ascending priority comparator — Unprioritized (`null`)
 * always sorts after every ranked ship, consistently everywhere
 * Priority is a sort key (Fleet Dashboard, Mission Control, Mission
 * Control tile context names, the readiness-rank tiebreak — EWO-066
 * Part F's "canonical value" requirement extends to how it sorts, not
 * only how it's stored). */
export function comparePriority(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

/** True only for a positive integer — the one valid "ranked" shape;
 * anything else (0, negative, non-integer, NaN, missing) is Unprioritized. */
function isValidRank(priority: number | null | undefined): priority is number {
  return typeof priority === 'number' && Number.isInteger(priority) && priority > 0
}

/**
 * Self-healing normalization (Part G) — repairs duplicate priorities,
 * missing/invalid values, and gaps into a clean 1..N unique sequence,
 * preserving relative order (current priority, then original array
 * position as a stable tiebreak) wherever possible. Idempotent: running
 * this against an already-clean sequence returns the identical ranks.
 * Called on every store hydration (`merge`), not a one-time schema
 * migration — this self-heals even the fresh seed baseline's own known
 * duplicate (MOLE and Vulture both hand-authored as `priority: 2` in
 * seed.ts), and any future data that somehow drifts out of the
 * invariant, without needing a persisted-schema version bump.
 */
export function normalizeFleetPriorities<T extends PriorityAssignment>(items: T[]): T[] {
  const ranked = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isValidRank(item.priority))
    .sort((a, b) => (a.item.priority as number) - (b.item.priority as number) || a.index - b.index)
  const rankById = new Map(ranked.map(({ item }, i) => [item.id, i + 1]))
  return items.map((item) => ({ ...item, priority: rankById.get(item.id) ?? null }))
}

/**
 * Commander-initiated re-rank (Part E) — moves `targetId` to
 * `requestedPriority` (or `null` for Unprioritized). Every OTHER ranked
 * entry shifts as needed to keep the 1..N sequence unique and gap-free:
 * de-ranking closes the gap left behind; ranking (or re-ranking) shifts
 * everything at or after the target position down by one.
 * `requestedPriority` is clamped into `[1, rankedOthers.length + 1]` —
 * requesting a rank beyond the current fleet size lands at the end
 * rather than leaving a gap or erroring. Returns ONLY the entries whose
 * rank actually changed from their prior value — including the target
 * whenever IT actually moved, but the target itself is omitted too if
 * clamping happens to land it back on its own current position (a true
 * no-op re-request). The caller applies these and leaves every
 * untouched ship exactly as it was, so a re-rank never has to touch the
 * whole fleet's records — and an outright no-op returns an empty array.
 */
export function reorderFleetPriority<T extends PriorityAssignment>(items: T[], targetId: string, requestedPriority: number | null): PriorityAssignment[] {
  const rankedOthers = items
    .filter((item) => item.id !== targetId)
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isValidRank(item.priority))
    .sort((a, b) => (a.item.priority as number) - (b.item.priority as number) || a.index - b.index)
    .map(({ item }) => item)

  let result: PriorityAssignment[]
  if (requestedPriority === null) {
    result = [{ id: targetId, priority: null }, ...rankedOthers.map((item, i) => ({ id: item.id, priority: i + 1 }))]
  } else {
    const targetRank = Math.min(Math.max(1, Math.trunc(requestedPriority)), rankedOthers.length + 1)
    const before = rankedOthers.slice(0, targetRank - 1)
    const after = rankedOthers.slice(targetRank - 1)
    result = [
      ...before.map((item, i) => ({ id: item.id, priority: i + 1 })),
      { id: targetId, priority: targetRank },
      ...after.map((item, i) => ({ id: item.id, priority: targetRank + 1 + i })),
    ]
  }

  const originalById = new Map(items.map((item) => [item.id, item.priority]))
  return result.filter((entry) => entry.priority !== (originalById.get(entry.id) ?? null))
}

/**
 * Removing a ranked ship from the fleet closes the gap it leaves behind
 * (Part E) — equivalent to `reorderFleetPriority` de-ranking the
 * departing ship, minus that ship's own now-irrelevant entry. Pure
 * convenience wrapper so `removeFleetAsset` doesn't need to know
 * `reorderFleetPriority`'s own null-request convention.
 */
export function closePriorityGapOnRemoval<T extends PriorityAssignment>(items: T[], removedId: string): PriorityAssignment[] {
  return reorderFleetPriority(items, removedId, null).filter((entry) => entry.id !== removedId)
}

export interface FleetPriorityOption {
  /** The exact string a <select>'s onChange should translate back into a
   * `setFleetPriority` call — `'UNPRIORITIZED'` or a stringified position. */
  value: string
  label: string
}

/**
 * EWO-066A (Part C) — the Fleet Priority selector's own option list: the
 * CURRENT fleet order, position by position ("1 • Corsair," "2 • Ghost
 * Mk II," …), not anonymous numbers ("Priority 1," "Priority 2") —
 * "Priority relative to what?" is exactly the question a bare number
 * can't answer. The target ship's own current position (when ranked) is
 * labeled "(Current)"; picking any OTHER position's label is exactly
 * "take that ship's slot, and it (and everyone after) shifts down by
 * one" — the same `reorderFleetPriority` semantics already implement,
 * this only changes how the choice is presented. An unranked target
 * gets one extra trailing position (inserting it doesn't remove anyone
 * else from the ranking), labeled "(Last Priority)" since no ship
 * currently occupies it.
 */
export function buildFleetPriorityOptions<T extends PriorityAssignment & { name: string }>(ships: T[], targetShipId: string): FleetPriorityOption[] {
  const target = ships.find((s) => s.id === targetShipId)
  const ranked = ships
    .filter((s) => isValidRank(s.priority))
    .sort((a, b) => (a.priority as number) - (b.priority as number))
  const maxPosition = target && isValidRank(target.priority) ? ranked.length : ranked.length + 1

  const options: FleetPriorityOption[] = [{ value: 'UNPRIORITIZED', label: 'Unprioritized' }]
  for (let position = 1; position <= maxPosition; position++) {
    if (target?.priority === position) {
      options.push({ value: String(position), label: `${position} • ${target.name} (Current)` })
      continue
    }
    const occupant = ranked[position - 1]
    options.push({ value: String(position), label: occupant ? `${position} • ${occupant.name}` : `${position} • (Last Priority)` })
  }
  return options
}
