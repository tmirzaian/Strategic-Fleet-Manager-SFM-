/// <reference types="vite/client" />
/**
 * Browser-side loader for generated-data/missile-rack-slots.json
 * (FTB-001B) — see scripts/generateMissileRackSlots.ts for the full
 * root-cause investigation and derivation. Committed (not gitignored),
 * same licensing posture as RC-008's `*.runtime.json` files and
 * FTB-001A's mining-module-slots artifact: a small map of resolved facts
 * (per-rack slot count + accepted missile size), never raw DataCore
 * ports/paths/record ids.
 *
 * `import.meta.glob` (not a plain static import), matching every other
 * committed generated-data loader — if the file is ever missing, every
 * lookup degrades to "no known rack spec" instead of failing the build.
 */
const modules = import.meta.glob<{ default: unknown }>('../../generated-data/missile-rack-slots.json', { eager: true })
const rawFile = Object.values(modules)[0]?.default as { rackSlotSpecByEntityClass?: Record<string, { slotCount: number; missileSize: number }> } | undefined

const rackSlotSpecByEntityClass: Record<string, { slotCount: number; missileSize: number }> = rawFile?.rackSlotSpecByEntityClass ?? {}

/**
 * The real, source-derived missile-slot count and accepted missile size a
 * given rack entityClass carries on its own DataCore record — `null` for
 * anything not in the table (an uncataloged rack, or a genuinely
 * different component family such as a ground-vehicle/bomb rack this
 * mission's generator deliberately excludes). Never guessed, never a
 * per-size or per-display-name default — see the generator's own doc
 * comment for why (two racks sharing the display name "MSD-543"/
 * "MSD-683" carry genuinely different real counts).
 */
export function getMissileRackSlotSpec(entityClass: string | null | undefined): { slotCount: number; missileSize: number } | null {
  if (!entityClass) return null
  return rackSlotSpecByEntityClass[entityClass] ?? null
}
