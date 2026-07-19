/// <reference types="vite/client" />
/**
 * Browser-side loader for generated-data/mining-module-slots.json
 * (FTB-001A, Workstream C) — see scripts/generateMiningModuleSlots.ts for
 * the full root-cause investigation and derivation. Committed (not
 * gitignored), same licensing posture as RC-008's `*.runtime.json` files:
 * a small map of resolved facts (a per-entity module-slot COUNT), never
 * raw DataCore PortTags/record ids/paths.
 *
 * `import.meta.glob` (not a plain static import) purely as defense in
 * depth, matching every other committed generated-data loader in this
 * codebase — if the file is ever missing, every lookup here degrades to
 * "0 module slots" (no fabricated slots) instead of failing the build.
 */
const modules = import.meta.glob<{ default: unknown }>('../../generated-data/mining-module-slots.json', { eager: true })
const rawFile = Object.values(modules)[0]?.default as { moduleSlotCountByEntityClass?: Record<string, number> } | undefined

const moduleSlotCountByEntityClass: Record<string, number> = rawFile?.moduleSlotCountByEntityClass ?? {}

/**
 * The number of real, source-derived Mining Module attachment points a
 * given entityClass owns on its own DataCore record — 0 for anything not
 * in the table (an uncataloged component, or a real component confirmed
 * to have zero such ports, e.g. `Mining_Laser_SHIN_Klein_S1`). Never
 * guessed, never a per-size default — see the generator's own doc comment
 * for why a fixed per-size count would be wrong (Klein-S1 and Arbor MH1
 * are both nominally "S1" mining lasers with genuinely different real
 * module-slot counts).
 */
export function getMiningModuleSlotCount(entityClass: string | null | undefined): number {
  if (!entityClass) return 0
  return moduleSlotCountByEntityClass[entityClass] ?? 0
}
