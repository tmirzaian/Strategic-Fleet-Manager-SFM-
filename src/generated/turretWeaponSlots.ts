/// <reference types="vite/client" />
/**
 * Browser-side loader for generated-data/turret-weapon-slots.json
 * (SW-013C.2C — Child-Port Semantic Modes, Mode B: Independent Equipment
 * Ports) — see scripts/generateTurretWeaponSlots.ts for the full
 * derivation. Same licensing posture as the sibling mining-module/
 * missile-rack loaders: a small map of resolved facts (per-turret weapon
 * slot count + uniform weapon size), never raw DataCore ports/paths/
 * record ids.
 *
 * `import.meta.glob`, matching every other committed generated-data
 * loader — if the file is ever missing, every lookup degrades to "no
 * known turret spec" instead of failing the build.
 */
const modules = import.meta.glob<{ default: unknown }>('../../generated-data/turret-weapon-slots.json', { eager: true })
const rawFile = Object.values(modules)[0]?.default as { turretWeaponSlotSpecByEntityClass?: Record<string, { slotCount: number; weaponSize: number }> } | undefined

const turretWeaponSlotSpecByEntityClass: Record<string, { slotCount: number; weaponSize: number }> = rawFile?.turretWeaponSlotSpecByEntityClass ?? {}

/**
 * The real, source-derived weapon-slot count and uniform weapon size a
 * given turret/ball-turret assembly entityClass carries on its own real
 * children — `null` for anything not in the table. Never guessed, never
 * inferred from quantity or a name — see the generator's own doc comment.
 * Each entity here is Mode B ("Independent Equipment Ports"): unlike a
 * Mode A rack, every synthesized child is independently targetable —
 * consumers must never aggregate these into one shared target.
 */
export function getTurretWeaponSlotSpec(entityClass: string | null | undefined): { slotCount: number; weaponSize: number } | null {
  if (!entityClass) return null
  return turretWeaponSlotSpecByEntityClass[entityClass] ?? null
}
