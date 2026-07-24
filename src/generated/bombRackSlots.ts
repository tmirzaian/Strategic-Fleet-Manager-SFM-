/// <reference types="vite/client" />
/**
 * Browser-side loader for generated-data/bomb-rack-slots.json
 * (SW-013C.2D, Objectives 3/4) — see scripts/generateBombRackSlots.ts for
 * the full root-cause investigation and derivation. Mirrors
 * src/generated/missileRackSlots.ts's exact pattern; a separate loader for
 * a separate real component family (BombLauncher/BombRack), never merged
 * with the missile-rack table.
 *
 * `import.meta.glob` (not a plain static import), matching every other
 * committed generated-data loader — if the file is ever missing, every
 * lookup degrades to "no known rack spec" instead of failing the build.
 */
const modules = import.meta.glob<{ default: unknown }>('../../generated-data/bomb-rack-slots.json', { eager: true })
const rawFile = Object.values(modules)[0]?.default as { rackSlotSpecByEntityClass?: Record<string, { slotCount: number; bombSize: number }> } | undefined

const rackSlotSpecByEntityClass: Record<string, { slotCount: number; bombSize: number }> = rawFile?.rackSlotSpecByEntityClass ?? {}

/**
 * The real, source-derived bomb-slot count and accepted bomb size a given
 * rack entityClass carries on its own DataCore record — `null` for
 * anything not in the table (an uncataloged rack, or a genuinely
 * different component family such as a missile rack, which has its own
 * separate table). Never guessed, never a per-size or per-display-name
 * default.
 */
export function getBombRackSlotSpec(entityClass: string | null | undefined): { slotCount: number; bombSize: number } | null {
  if (!entityClass) return null
  return rackSlotSpecByEntityClass[entityClass] ?? null
}
