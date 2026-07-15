/// <reference types="vite/client" />
/**
 * Browser-side loader for generated-data/component-metadata-catalog.json
 * (Mission M-007, widened to the full player-usable universe by Mission
 * M-012).
 *
 * Gitignored — see .gitignore's licensing-posture note and ADR-005 — so
 * `import.meta.glob` is used instead of a static import, exactly like
 * src/generated/shipCatalog.ts: a fresh clone that hasn't run
 * `npm run generate:component-catalog` locally gets an empty catalog
 * here (a normal, expected state), not a build failure.
 */

/** DataCore's own `AttachDef.Type` -> SFM's existing port-type vocabulary
 * (see src/data/seed.ts's hardpoint `type` values) or a new category
 * where none of the existing ones fit. Mirrors
 * scripts/componentCatalog/componentTaxonomy.ts's inclusion list exactly
 * — this is the browser-side half of the same reviewed taxonomy, kept as
 * a separate copy (rather than importing across the scripts/src
 * boundary) the same way src/generated/shipCatalog.ts keeps its own
 * minimal types instead of importing scripts/shipCatalog's. */
const CATEGORY_TO_PORT_TYPE: Record<string, string> = {
  WeaponGun: 'Weapon',
  WeaponDefensive: 'Utility',
  WeaponMining: 'Mining Laser',
  WeaponMount: 'Gimbal Mount',
  Shield: 'Shield',
  Cooler: 'Cooler',
  PowerPlant: 'Power Plant',
  QuantumDrive: 'Quantum Drive',
  JumpDrive: 'Jump Drive',
  MissileLauncher: 'Missile Rack',
  GroundVehicleMissileLauncher: 'Missile Rack',
  Missile: 'Missile',
  Radar: 'Radar',
  LifeSupportGenerator: 'Life Support',
  Relay: 'Relay',
  TractorBeam: 'Utility',
  TowingBeam: 'Utility',
  SalvageHead: 'Salvage Module',
  Bomb: 'Bomb',
  BombLauncher: 'Bomb Launcher',
}

interface RawCatalogRecord {
  category: string | null
  size: number | null
  displayName: string | null
  grade: number | null
  /** Inconsistent raw shape — sometimes a short code ("AEG", "ANVL"),
   * sometimes a `scitemmanufacturer.<code>.json` file reference, often
   * null. See `manufacturerCodeFromRef` below for the conservative,
   * never-guessing extraction this mission (EWO-028, Task 2) applies. */
  manufacturerRef: string | null
}

interface RawCatalogFile {
  schemaVersion: number
  records: Record<string, RawCatalogRecord>
}

const modules = import.meta.glob<{ default: unknown }>('../../generated-data/component-metadata-catalog.json', { eager: true })
const rawCatalog = Object.values(modules)[0]?.default as RawCatalogFile | undefined

export interface CatalogComponentEntry {
  category: string
  size: number
  /** EWO-026 (Task 5/7) — carried through from the same raw record this
   * entry is built from (see the population loop below), so a
   * catalog-only component (one that never appears as an actual Factory/
   * Installed/Target assignment on a deep-imported ship, and therefore
   * never resolves via `componentByDisplayName`) still has its real grade
   * reachable by display name — this is the exact data the Target
   * picker's option list already keys off of. Previously dropped here
   * even though the same loop iteration reads `record.grade` two lines
   * below for `catalogComponentsByEntityClass` — the data was never
   * missing, only unreachable by name. */
  grade: number | null
  /** EWO-028 (Task 1/2) — the real DataCore entity class this display
   * name resolved from, the same "first entityClass wins" record this
   * entry's other fields already came from. This is the canonical
   * component identifier Hangar Inventory's Add workflow now uses for
   * duplicate-quantity-merge identity (Design Authority Ruling 1) —
   * never invented, always the literal raw key this record was read
   * from. */
  entityClass: string
  /** EWO-028 (Task 2) — best-effort manufacturer short code, only ever
   * set when cleanly extractable (see `manufacturerCodeFromRef`) — never
   * a guess. Resolve to a display name via manufacturerLogo.ts's
   * reviewed alias table; null here or an unreviewed code both mean "not
   * shown," never fabricated. */
  manufacturerCode: string | null
}

/**
 * EWO-028 (Task 2) — `manufacturerRef` is inconsistent raw source data:
 * sometimes already a short code, sometimes a
 * `scitemmanufacturer.<code>.json` reference path, often null. Only
 * extracts a code when the shape is unambiguous; anything else (a
 * differently-shaped path, free text, null) resolves to null rather than
 * guessing — "manufacturer when available" means genuinely available,
 * not best-effort reconstructed.
 */
function manufacturerCodeFromRef(manufacturerRef: string | null): string | null {
  if (!manufacturerRef) return null
  const pathMatch = manufacturerRef.match(/scitemmanufacturer\.([a-z0-9]+)\.json$/i)
  if (pathMatch) return pathMatch[1].toUpperCase()
  if (/^[A-Z][A-Z0-9]{1,5}$/.test(manufacturerRef)) return manufacturerRef
  return null
}

/** Player-usable, display-named components only, keyed by display name — the name a free-text component/target input would actually contain. */
export const catalogComponentsByName: Map<string, CatalogComponentEntry> = new Map()

/** A record whose real localization key never resolved — a known, explicit
 * sentinel (see scripts/generateComponentCatalog.ts), not a real name.
 * Never treat this as resolved metadata. */
const PLACEHOLDER_DISPLAY_NAME = '<= PLACEHOLDER =>'

export interface CatalogPresentationEntry {
  displayName: string
  grade: number | null
}

/**
 * Richer lookup for presentation purposes (EWO-019A), keyed by raw entity
 * class (e.g. "POWR_TYDT_S01_DeltaMax_SCItem") rather than by display name,
 * and — unlike catalogComponentsByName above — not restricted to the
 * reviewed player-usable port-type allowlist, since a presentation label
 * should be shown for any component with a real resolved name, whether or
 * not it's also a valid free-text target-item choice. Placeholder/
 * unresolved localization entries are excluded rather than surfaced.
 */
export const catalogComponentsByEntityClass: Map<string, CatalogPresentationEntry> = new Map()

if (rawCatalog) {
  for (const [entityClass, record] of Object.entries(rawCatalog.records)) {
    if (!record.displayName || !record.category || record.size === null) continue
    const portType = CATEGORY_TO_PORT_TYPE[record.category]
    if (portType) {
      // First entry for a given display name wins — DataCore has real
      // cross-manufacturer name collisions (Mission M-006 finding), and
      // preferring the first alphabetically-sorted entity class is at
      // least deterministic, never a guess about which is "canonical".
      if (!catalogComponentsByName.has(record.displayName)) {
        catalogComponentsByName.set(record.displayName, {
          category: portType,
          size: record.size,
          grade: record.grade,
          entityClass,
          manufacturerCode: manufacturerCodeFromRef(record.manufacturerRef),
        })
      }
    }
    if (record.displayName !== PLACEHOLDER_DISPLAY_NAME && !catalogComponentsByEntityClass.has(entityClass)) {
      catalogComponentsByEntityClass.set(entityClass, { displayName: record.displayName, grade: record.grade })
    }
  }
}

export const hasComponentCatalog = catalogComponentsByName.size > 0
