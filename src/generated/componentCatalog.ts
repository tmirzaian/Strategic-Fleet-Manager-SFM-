/// <reference types="vite/client" />
/**
 * Browser-side loader for
 * generated-data/component-metadata-catalog.runtime.json (Mission M-007,
 * widened to the full player-usable universe by Mission M-012, re-pointed
 * by RC-008 — Portable Runtime Catalog Certification, `subtype` restored
 * and entityClass-first/ambiguity-aware resolution added by
 * EWO-STAB-004A/CAT-003).
 *
 * RC-007 found the full catalog (gitignored per ADR-005) is a hard
 * runtime dependency with no fallback data for a real GitHub clone.
 * RC-008's fix: `npm run generate:component-catalog` now also derives and
 * commits `component-metadata-catalog.runtime.json` — the small subset
 * this loader actually reads, stripped of dev-only fields (`recordId`,
 * `recordName`, `localizationKey`, `provenance` — confirmed unread here by
 * direct audit). `import.meta.glob` stays in place as defense in depth,
 * exactly like src/generated/shipCatalog.ts: if the runtime file is ever
 * missing, this degrades to an empty catalog rather than failing the
 * build.
 *
 * CAT-003 found `subtype` was dropped here by RC-008 ("confirmed unread")
 * — correct at the time, but it is the one canonical field that
 * distinguishes a Point Defense Turret assembly (`subtype: "PDCTurret"`)
 * from an ordinary gimbal/turret mount (`subtype: "GunTurret"`) sharing
 * the same `category: "Turret"` and size. Restored, verbatim, never
 * translated here — see `src/data/componentCatalog.ts` for where
 * DataCore's raw category/subtype vocabulary is interpreted into
 * compatibility decisions.
 */

/** DataCore's own `AttachDef.Type` -> SFM's existing port-type vocabulary
 * (see src/data/seed.ts's hardpoint `type` values) or a new category
 * where none of the existing ones fit. Mirrors
 * scripts/componentCatalog/componentTaxonomy.ts's inclusion list exactly
 * — this is the browser-side half of the same reviewed taxonomy, kept as
 * a separate copy (rather than importing across the scripts/src
 * boundary) the same way src/generated/shipCatalog.ts keeps its own
 * minimal types instead of importing scripts/shipCatalog's. */
// EWO-STAB-004A — exported so src/data/componentCatalog.ts's ordinary
// (non-PDC) compatibility path can translate a canonical record's raw
// DataCore category into the same port-type vocabulary this file already
// uses, rather than duplicating the table.
export const CATEGORY_TO_PORT_TYPE: Record<string, string> = {
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
  /** EWO-STAB-004A/CAT-003 — DataCore's own SubType, verbatim (e.g. "Gun",
   * "GunTurret", "PDCTurret"); `null` when the source record carries none. */
  subtype: string | null
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

const modules = import.meta.glob<{ default: unknown }>('../../generated-data/component-metadata-catalog.runtime.json', { eager: true })
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

/**
 * EWO-STAB-004A (ADR-010, CAT-003) — the canonical, entityClass-first
 * resolution surface. Unlike `catalogComponentsByName`/
 * `catalogComponentsByEntityClass` above (both pre-existing, both left
 * unchanged for their pre-existing consumers — presentation and the
 * Hangar Add workflow), this is where compatibility- and
 * installation-sensitive code resolves a component's real identity.
 *
 * Two differences from the legacy maps, both required by CAT-003:
 *   1. `category`/`subtype` here are DataCore's raw, untranslated
 *      vocabulary ("Turret"/"PDCTurret", "WeaponGun"/"Gun") — never run
 *      through `CATEGORY_TO_PORT_TYPE`. That translation is a concern of
 *      the ordinary-weapon compatibility path (src/data/componentCatalog.ts),
 *      not of what the catalog itself knows about a component.
 *   2. Not restricted to the CATEGORY_TO_PORT_TYPE allowlist — a
 *      `category: "Turret"` component (a PDC turret assembly) must be
 *      resolvable here even though it was never reachable through
 *      `catalogComponentsByName` (the exact gap CAT-003 found).
 */
export interface CanonicalComponentRecord {
  entityClass: string
  /** DataCore's own Type, verbatim (e.g. "WeaponGun", "Turret"). */
  category: string
  /** DataCore's own SubType, verbatim (e.g. "Gun", "GunTurret", "PDCTurret"); null when absent. */
  subtype: string | null
  size: number
  displayName: string
  grade: number | null
  manufacturerCode: string | null
}

export type ComponentResolution =
  | { status: 'resolved'; record: CanonicalComponentRecord }
  /** Two or more DISTINCT entityClasses share this display name (e.g.
   * `M2C "Swarm"` — a Turret/PDCTurret assembly and, separately, its own
   * internal WeaponGun/Gun). `candidates` lists every one of them —
   * never a guess about which is "canonical". */
  | { status: 'ambiguous'; candidates: CanonicalComponentRecord[] }
  /** No catalog record at all for this entityClass/name — genuinely
   * uncataloged, not ambiguous. Callers apply the existing permissive
   * "can't disprove compatibility we have no data for" policy to this
   * case, unchanged (EWO-024). */
  | { status: 'unresolved' }

/** Every cataloged component, keyed by entityClass — the full, ungated
 * set (same base guard as catalogComponentsByName: displayName/category/
 * size all present), independent of CATEGORY_TO_PORT_TYPE. */
export const componentsByEntityClass: Map<string, CanonicalComponentRecord> = new Map()

/** Every cataloged component grouped by display name — a name with more
 * than one entry here is a real, multi-entityClass collision, not a
 * dedup artifact (JSON object keys, i.e. entityClasses, cannot repeat). */
const componentsByDisplayNameInternal: Map<string, CanonicalComponentRecord[]> = new Map()

if (rawCatalog) {
  for (const [entityClass, record] of Object.entries(rawCatalog.records)) {
    if (!record.displayName || !record.category || record.size === null) continue
    const canonical: CanonicalComponentRecord = {
      entityClass,
      category: record.category,
      subtype: record.subtype,
      size: record.size,
      displayName: record.displayName,
      grade: record.grade,
      manufacturerCode: manufacturerCodeFromRef(record.manufacturerRef),
    }
    componentsByEntityClass.set(entityClass, canonical)
    const group = componentsByDisplayNameInternal.get(record.displayName)
    if (group) group.push(canonical)
    else componentsByDisplayNameInternal.set(record.displayName, [canonical])
  }
}

/** Exact entityClass lookup (EWO-STAB-004A, Assignment 2). An entityClass
 * supplied but not found in the catalog resolves `unresolved` — never
 * silently substituted with a same-name component found some other way;
 * callers must not fall back to name resolution when a specific
 * entityClass was requested and missed. */
export function resolveComponentByEntityClass(entityClass: string): ComponentResolution {
  const record = componentsByEntityClass.get(entityClass)
  return record ? { status: 'resolved', record } : { status: 'unresolved' }
}

/**
 * The compatibility-relevant "shape" of a canonical record — two
 * candidates sharing a display name are compatibility-equivalent (safe to
 * treat as one, never ambiguous) exactly when they'd be evaluated
 * identically by `src/data/componentCatalog.ts`'s `checkCompatibility`:
 *   - A `subtype: "PDCTurret"` record is always evaluated by its own
 *     dedicated rule, keyed only by size — its raw `category` ("Turret")
 *     is never itself compared.
 *   - Otherwise, `checkCompatibility`'s ordinary path never reads
 *     `subtype` at all (every port's own `allowedSubtypes` is empty, so
 *     that check always passes) — only the CATEGORY_TO_PORT_TYPE
 *     translation of `category`, plus `size`, ever affects the outcome.
 *   - A raw category with NO translation resolves the exact same way
 *     regardless of which untranslatable category it is (permissive,
 *     "can't disprove compatibility we have no data for" — the
 *     pre-existing behavior for e.g. a mount/turret housing's own row,
 *     category "Turret"/"TurretBase"), so every such candidate shares one
 *     shape regardless of its specific raw category string.
 */
function compatibilityShapeKey(record: CanonicalComponentRecord): string {
  if (record.subtype === 'PDCTurret') return `pdc-turret:${record.size}`
  const translated = CATEGORY_TO_PORT_TYPE[record.category]
  return translated ? `${translated}:${record.size}` : 'untranslatable'
}

/** Ambiguity-aware display-name lookup (EWO-STAB-004A, Assignment 3).
 * Replaces "first entry wins" for every caller that needs a safe
 * resolution: a name shared by two or more entityClasses whose
 * compatibility shapes (see `compatibilityShapeKey`) DISAGREE is reported
 * `ambiguous`, never silently resolved to whichever one happens to be
 * first.
 *
 * Candidates that agree on shape are treated as compatibility-equivalent,
 * not ambiguous — confirmed by direct catalog audit to be real, common
 * gameplay/cosmetic SKU variants of the same physical item (e.g.
 * "Ecouter"/`RADR_GRNP_S01_Ecouter_Piercing`, both Radar/S1; "MSD-322
 * Missile Rack"'s ground-vehicle and spaceship variants, both translating
 * to Missile Rack/S3). Picking any one of them can never produce a
 * different compatibility answer, so refusing to validate would protect
 * nothing while breaking a great many ordinary, unrelated components —
 * unlike `M2C "Swarm"` (CAT-003's own finding), whose candidates
 * genuinely disagree (a PDC turret shape vs an ordinary Weapon/S1 shape),
 * which is exactly the case this ambiguity check exists to catch. */
export function resolveComponentByName(displayName: string): ComponentResolution {
  const candidates = componentsByDisplayNameInternal.get(displayName)
  if (!candidates || candidates.length === 0) return { status: 'unresolved' }
  if (candidates.length === 1) return { status: 'resolved', record: candidates[0] }
  const distinctShapes = new Set(candidates.map(compatibilityShapeKey))
  if (distinctShapes.size === 1) return { status: 'resolved', record: candidates[0] }
  return { status: 'ambiguous', candidates }
}
