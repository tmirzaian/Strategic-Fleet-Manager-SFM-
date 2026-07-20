import type { ShipDefinition } from '../types'
import { ships as seedShips, hardpoints as seedHardpoints } from './seed'
import { importedShipList, type ImportedShipView } from '../generated/importedShips'
import { shipCatalogRecords } from '../generated/shipCatalog'
import { classificationFor } from './shipClassification'
import { componentsByEntityClass } from '../generated/componentCatalog'
import { canonicalManufacturerName } from '../utils/manufacturerLogo'

/**
 * Entity classes already covered by the deep, per-ship normalized
 * port-tree pipeline (generated-data/ships.json et al). Derived directly
 * from each imported ship's own `sourceEntityClass` (the raw StarBreaker
 * class name, e.g. "AEGS_Gladius") rather than hand-maintained, so this
 * set never drifts out of sync with what has actually been deep-imported.
 * The lightweight ship catalog (Mission M-012) discovers these same ships
 * too, since it scans the whole LIVE universe — this exclusion set
 * prevents Add Ship from showing two separate entries for the same real
 * ship (one deep, one catalog-only).
 */
const DEEP_IMPORTED_ENTITY_CLASSES = new Set(
  importedShipList.map((v) => v.ship.sourceEntityClass).filter((c): c is string => Boolean(c))
)

/**
 * A minimal, ship-model-agnostic factory hardpoint template — every new
 * FleetAsset for a given ShipDefinition starts by cloning this list, with
 * installed/target initialized to match factory (see
 * src/utils/fleetAssetMaterializer.ts). This is deliberately NOT the same
 * as any one existing ship's *current* (possibly player-customized)
 * hardpoint state — a brand new copy of a Ghost should start factory-fresh,
 * not with another Ghost's Mirage already installed.
 */
export interface FactoryHardpointTemplate {
  slotLabel: string
  type: string
  size: string
  factoryItem: string
  /** When set, this row is a child of the row in the same template whose
   * slotLabel matches this value (Mission M-011) — mirrors
   * Hardpoint.parentSlotLabel so nested mount/turret/rack structure
   * survives from a ShipDefinition's template all the way through
   * materializeFleetAsset into real Hardpoint rows. See
   * src/utils/portTree.ts for the generic tree-building logic that reads
   * this on the materialized side. */
  parentSlotLabel?: string
  /** EWO-019B — mirrors Hardpoint.groupLabel; see that field's doc comment. */
  groupLabel?: string
  /** EWO-020 — mirrors Port.assemblyRole; see src/normalizer/assemblyRole.ts. */
  assemblyRole?: string
  /** EWO-020 — mirrors Port.isStructural; see Hardpoint.isStructural's doc comment. */
  isStructural?: boolean
  /** EWO-043 — the originating authoritative Port's own stable canonical
   * id (see src/normalizer's Port.id), when this row comes from the deep
   * import pipeline. A hand-authored seed row has no such id and leaves
   * this undefined. This is the strongest signal
   * src/utils/fleetAssetReconciliation.ts uses to re-match a Commander's
   * persisted Hardpoint row across an authoritative template change. */
  sourcePortId?: string
  /** EWO-STAB-004A (ADR-010, CAT-003) — the factory-installed component's
   * real DataCore entityClass, carried straight from the import
   * pipeline's own already-resolved `Port.factoryItemId`/`componentById`
   * (see `importedFactoryTemplate` below) — never re-derived from
   * `factoryItem`'s display-name string. This matters because some
   * display names (e.g. `M2C "Swarm"`) are genuinely ambiguous across
   * multiple real entityClasses; re-resolving by name would hit that
   * ambiguity, while this field is the exact, disambiguated identifier
   * already known at generation time. Undefined for a hand-authored seed
   * row, which has no import pipeline behind it. */
  factoryEntityClass?: string
}

const shipCatalogRecordByEntityClass = new Map(shipCatalogRecords.map((r) => [r.entityClass, r]))

/**
 * CWO-005 (Task 1) — a handful of raw catalog `displayName` strings carry
 * source-data whitespace artifacts (a literal stray "\n" on Argo CSV-SM, a
 * doubled space on the Aurora Mk I LX) that have nothing to do with name
 * derivation — confirmed via direct audit to be the only two affected
 * records in the entire 299-record catalog. Collapsed unconditionally so
 * neither slips into a Commander-facing name.
 */
function sanitizeCatalogDisplayName(raw: string): string {
  return raw.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * CWO-005 (Task 1) — the universe ship catalog's own manufacturer.name is
 * occasionally the full in-fiction company name ("Musashi Industrial &
 * Starflight Concern" for MISC) or a differently-cased short form
 * ("Consolidated Outland", abbreviated "C.O." in the localized name, not
 * its "CNOU" DataCore code) rather than the literal prefix token the
 * localized displayName actually uses — confirmed by direct audit to be
 * the only two codes affected among all 256 deep-imported hulls.
 */
const DEEP_IMPORT_MANUFACTURER_PREFIX_ALIASES: Record<string, string> = { MIS: 'MISC', CNOU: 'C.O.' }

/**
 * EWO-050 — Grey's Market (code GLSN) ship names are conventionally
 * styled "Grey's <Model>" ("Grey's Basher", "Grey's Shiv") — "Grey's"
 * here is part of each ship's own product name, not a redundant repeat
 * of the manufacturer's name the way "Aegis Gladius" repeats "Aegis".
 * The corroboration check below can't tell the two apart (the
 * manufacturer's own full name, "Grey's Market", genuinely does start
 * with "Grey's"), so it would otherwise strip a real word out of the
 * official name — confirmed against GLSN_Shiv, which incorrectly
 * resolved to bare "Shiv" before this exception existed.
 *
 * Unlike the VNCL_Scythe/VNCL_Stinger corroboration-failure case below
 * (where falling back to the raw derived name is correct, because that
 * name already happened to be bare/correct), falling back would be wrong
 * here — the raw derived name ("Shiv") is missing the real "Grey's"
 * prefix entirely. `canonicalDeepImportDisplayName` checks this set
 * itself and uses the sanitized catalog name verbatim, bypassing
 * `stripCorroboratedManufacturerPrefix` (and its fallback) altogether.
 */
const NEVER_STRIP_MANUFACTURER_CODES = new Set(['GLSN'])

/** Strips a manufacturer-name prefix from a real, official localized ship
 * name, only when the manufacturer info corroborates the prefix really is
 * one (full name, DataCore code, or a reviewed alias) — returns null
 * (never a guess) when it doesn't, so the caller can fall back safely. */
function stripCorroboratedManufacturerPrefix(displayName: string, manufacturerName: string | null | undefined, manufacturerCode: string | null | undefined): string | null {
  const firstWord = displayName.split(' ')[0]
  if (!firstWord) return displayName
  const matchesFullName = manufacturerName?.toLowerCase().startsWith(firstWord.toLowerCase())
  const matchesCode = manufacturerCode?.toLowerCase() === firstWord.toLowerCase()
  const matchesKnownAlias = manufacturerCode ? DEEP_IMPORT_MANUFACTURER_PREFIX_ALIASES[manufacturerCode]?.toLowerCase() === firstWord.toLowerCase() : false
  if (matchesFullName || matchesCode || matchesKnownAlias) return displayName.slice(firstWord.length).trim()
  return null
}

/**
 * CWO-005 (Task 1) — Commander-facing canonical name resolution for
 * deep-imported ships. `deriveShipName` (src/normalizer/shipNormalizer.ts)
 * only strips the manufacturer-code token from the raw entity class to
 * build a stable internal id/slug ("ANVL_Hornet_F7CS_Mk2" -> "Hornet F7CS
 * Mk2") — it was never meant to produce a presentation-quality name, and
 * Commander Beta Certification confirmed it reads nothing like RSI's own
 * naming ("F7C-S Hornet Ghost Mk II"). The bulk universe ship catalog
 * (generated-data/ship-catalog.json, scripts/shipCatalog) independently
 * resolves the SAME entity class's real in-game localized name for every
 * ship in the game, including every one that's also been deep-imported —
 * confirmed via direct audit that all 256 deep-imported hulls have a
 * matching catalog record. This is a presentation-only substitution: only
 * `ShipDefinition.displayName` changes here; `id`/`internalName`/
 * `portIds`/`factoryLoadoutId` all still derive from `deriveShipName`
 * exactly as before (unchanged), so no persisted FleetAsset reference,
 * hardpoint, or reconciliation match is affected.
 *
 * Two hulls (VNCL_Scythe, VNCL_Stinger) are a confirmed, documented
 * exception: their own catalog record's `manufacturer` field is
 * cross-attributed (Scythe's says "Esperia" though its displayName reads
 * "Vanduul Scythe"; Stinger's says "Vanduul" though its displayName reads
 * "Esperia Stinger") — the same anomaly scripts/shipImages/
 * reviewedNameAliases.ts already documented independently. The
 * corroboration check below can't safely strip either prefix, so both
 * fall back to their existing derived name ("Scythe"/"Stinger"), which
 * was already the correct bare name.
 */
function canonicalDeepImportDisplayName(v: (typeof importedShipList)[number]): string {
  const entityClass = v.ship.sourceEntityClass
  const record = entityClass ? shipCatalogRecordByEntityClass.get(entityClass) : undefined
  if (!record?.displayName) return v.ship.name
  const sanitized = sanitizeCatalogDisplayName(record.displayName)
  const manufacturerCode = record.manufacturer?.code
  if (manufacturerCode && NEVER_STRIP_MANUFACTURER_CODES.has(manufacturerCode)) return sanitized
  const stripped = stripCorroboratedManufacturerPrefix(sanitized, record.manufacturer?.name, manufacturerCode)
  return stripped ?? v.ship.name
}

/**
 * EWO-051 (Manufacturer Integrity Initiative) — a deep-imported ship's own
 * `v.ship.manufacturer` field is sometimes genuinely blank (34 real ships
 * confirmed by direct audit: Blade, MTC, ROC, Prowler, Talon, the Wolf/
 * Merlin/Archimedes family, Nox family, San'tok.yāi, and more) — not
 * because the manufacturer is unknown, but because the deep-import
 * pipeline never cross-referenced the SAME real DataCore manufacturer
 * record Mission M-012's ship-catalog generator already resolved for the
 * identical hull (by `sourceEntityClass`) — an importer omission, not a
 * genuine data gap: every one of these 34 ships has a real, resolved
 * manufacturer in `shipCatalogRecordByEntityClass` already. Falls back to
 * that before canonicalizing; only a hull with no catalog record AND no
 * raw manufacturer at all resolves to 'Unknown'.
 */
function importedManufacturerFor(v: ImportedShipView): string {
  const raw = v.ship.manufacturer
  if (raw && raw.trim()) return canonicalManufacturerName(raw)
  const entityClass = v.ship.sourceEntityClass
  const record = entityClass ? shipCatalogRecordByEntityClass.get(entityClass) : undefined
  return canonicalManufacturerName(record?.manufacturer?.name ?? record?.manufacturer?.code)
}

const seedDefinitions: ShipDefinition[] = seedShips.map((s) => ({
  id: s.id,
  internalName: s.id,
  displayName: s.name,
  manufacturer: canonicalManufacturerName(s.manufacturer),
  classification: classificationFor(s.id),
  career: s.career,
  role: s.role,
  imageUrl: s.imageUrl,
  equipmentGroups: [],
  portIds: [],
  factoryLoadoutId: `${s.id}-factory-loadout`,
  sourceMetadata: { sourceType: 'seed' },
}))

const importedDefinitions: ShipDefinition[] = importedShipList.map((v) => ({
  id: v.ship.id,
  internalName: v.ship.id,
  displayName: canonicalDeepImportDisplayName(v),
  manufacturer: importedManufacturerFor(v),
  classification: classificationFor(v.ship.id, v.ship.sourceEntityClass ? shipCatalogRecordByEntityClass.get(v.ship.sourceEntityClass) : undefined, v.ship.sourceEntityClass),
  career: v.ship.career,
  role: v.ship.role,
  imageUrl: v.ship.imageUrl,
  image: v.imageManifestEntry ? { primaryUrl: v.imageManifestEntry.primaryUrl ?? undefined, source: v.imageManifestEntry.source, status: v.imageManifestEntry.status } : undefined,
  equipmentGroups: Array.from(new Set(v.ports.map((p) => p.equipmentGroup))),
  portIds: v.ports.map((p) => p.id),
  factoryLoadoutId: v.factoryLoadout?.id ?? `${v.ship.id}-factory-loadout`,
  sourceMetadata: { sourceType: 'StarBreaker', sourceFile: undefined },
}))

/**
 * Mission M-012: the complete authoritative ship/ground-vehicle roster
 * (generated-data/ship-catalog.json), minus whatever's already covered by
 * the deep import pipeline above. These definitions carry identity/
 * classification metadata only — no port tree — so a ship added from this
 * source materializes with an empty factory loadout (see
 * importedFactoryTemplate below, and src/utils/fleetAssetMaterializer.ts).
 * That's a deliberate, honest, documented limitation: full per-ship
 * loadout normalization for the ~290-ship catalog is its own future
 * undertaking, not this mission's "catalog breadth and application
 * integration" scope.
 */
const catalogDefinitions: ShipDefinition[] = shipCatalogRecords
  .filter((r) => !DEEP_IMPORTED_ENTITY_CLASSES.has(r.entityClass))
  .map((r) => ({
    id: r.entityClass,
    internalName: r.entityClass,
    displayName: r.displayName!,
    manufacturer: canonicalManufacturerName(r.manufacturer?.name ?? r.manufacturer?.code),
    classification: classificationFor(r.entityClass, r),
    career: r.careerName ?? r.careerKey ?? 'Unknown',
    role: r.roleName ?? r.roleKey ?? 'Unknown',
    equipmentGroups: [],
    portIds: [],
    factoryLoadoutId: `${r.entityClass}-factory-loadout`,
    sourceMetadata: { sourceType: 'StarBreaker', sourceFile: 'ship-catalog' },
  }))

const allDefinitions: ShipDefinition[] = [...seedDefinitions, ...importedDefinitions, ...catalogDefinitions]

/**
 * EWO-021 — how "complete" a definition's own data is, used only to pick
 * one canonical definition when multiple describe the same real hull.
 * Lower is better. A deep-imported definition (real StarBreaker port
 * tree) always outranks a seed definition (hand-authored, but real,
 * non-empty hardpoints); both outrank a bare Mission M-012 catalog entry
 * (`portIds: []` by design — a genuine placeholder, never a competitor
 * for identity once anything richer exists for the same hull).
 */
function definitionCompletenessRank(d: ShipDefinition): number {
  if (d.sourceMetadata.sourceType === 'seed') return 1
  if (d.sourceMetadata.sourceType === 'StarBreaker' && d.sourceMetadata.sourceFile === 'ship-catalog') return 2
  return 0 // deep-imported
}

/**
 * The real-world hull name a definition describes, for duplicate
 * detection — stripped of the catalog's own manufacturer-name prefix.
 * Mission M-012's catalog bakes the manufacturer directly into
 * `displayName` (e.g. "Drake Cutlass Red"), while every seed and
 * deep-imported `ShipDefinition`'s own name is already bare ("Cutlass
 * Red", "Corsair") — without stripping that prefix, the exact same real
 * hull would never be recognized as a duplicate across sources. Only
 * strips when the definition's own `manufacturer` field corroborates the
 * first word really is a manufacturer name (never a guess against the
 * model name itself).
 *
 * MWO-001 (Task 2) — a catalog record's `manufacturer` field prioritizes
 * the resolved full name ("Roberts Space Industries") over the stable
 * DataCore code ("RSI") whenever the name is available (see
 * `catalogDefinitions` above), which meant a displayName prefixed with
 * the short code alone (e.g. "RSI Apollo Medivac", "MISC Starfarer")
 * never stripped — confirmed to keep 6 real Golden Fleet promotion
 * candidates (Apollo Medivac, Apollo Triage, Constellation Phoenix,
 * Starfarer, Polaris, Ursa) from ever grouping with their own newly
 * deep-imported counterpart. Checking the record's own code as a second,
 * equally authoritative corroboration source (never a guess) closes this
 * without touching the `ShipDefinition` type or any other consumer.
 */
const manufacturerCodeByEntityClass = new Map(shipCatalogRecords.map((r) => [r.entityClass, r.manufacturer?.code]))

/**
 * MWO-001 (Task 2) — one further hand-reviewed, narrow exception: MISC's
 * stable DataCore code is "MIS" (3 letters), but the game's own in-fiction
 * ship-naming convention prefixes every MISC hull's display name with
 * "MISC" (4 letters) — a genuine inconsistency in the source data itself,
 * not something either the full-name or code check above can catch.
 * Confirmed the only such case among all promoted hulls (Starfarer);
 * Prospector/Starlite never needed this at all, since their deep-import
 * displayName already strips the raw "MISC_" entity prefix independently
 * (src/normalizer/displayNameGenerator.ts), unrelated to this catalog-side check.
 */
const KNOWN_DISPLAY_PREFIX_ALIASES: Record<string, string> = { MIS: 'MISC' }

function bareHullName(d: ShipDefinition): string {
  if (d.sourceMetadata.sourceType === 'StarBreaker' && d.sourceMetadata.sourceFile === 'ship-catalog') {
    const firstWord = d.displayName.split(' ')[0]
    if (!firstWord) return d.displayName
    const code = manufacturerCodeByEntityClass.get(d.id)
    const matchesFullName = d.manufacturer.toLowerCase().startsWith(firstWord.toLowerCase())
    const matchesCode = code?.toLowerCase() === firstWord.toLowerCase()
    const matchesKnownAlias = code && KNOWN_DISPLAY_PREFIX_ALIASES[code]?.toLowerCase() === firstWord.toLowerCase()
    if (matchesFullName || matchesCode || matchesKnownAlias) {
      return d.displayName.slice(firstWord.length).trim()
    }
  }
  return d.displayName
}

/**
 * EWO-021 (Canonical Ship Definition Consolidation) — Commander Sea
 * Trials confirmed the same real hull could appear more than once in Add
 * Ship (e.g. the seed fleet's hand-authored "Cutlass Black" alongside the
 * deep-imported "Cutlass Black"; the seed fleet's "Cutlass Red" alongside
 * Mission M-012's placeholder catalog entry "Drake Cutlass Red") —
 * confusing, and the non-canonical choice always produced worse data
 * (Unknown Factory Item, placeholder imagery). A direct audit found this
 * pattern affects 10 of the 12 seed ships, not just Cutlass Black/Red.
 *
 * Every definition describing the same hull (grouped by `bareHullName`)
 * is ranked by `definitionCompletenessRank`; only the best-ranked one is
 * ever selectable here. Every definition — canonical or not — remains
 * resolvable via `shipDefinitionById`/`shipFactoryTemplates` below, so an
 * already-persisted FleetAsset referencing a non-canonical id never loses
 * its data; it is simply never offered again as a *new* pick.
 */
/**
 * MWO-001 (Task 2) — a hand-reviewed override for the one Golden Fleet
 * promotion candidate whose deep-import-derived name will never
 * naturally bareHullName-match its seed counterpart: the Ghost Mk II's
 * raw entity class ("ANVL_Hornet_F7CS_Mk2") derives to "Hornet F7CS
 * Mk2" (deriveShipName strips only the manufacturer prefix, never
 * invents the "Ghost" nickname the seed fixture was hand-typed with).
 * Confirmed the ONLY such case among all 10 seed-backed promotion
 * candidates by direct simulation against the staged 4.9 exports — the
 * other 9 (135c, Cutlass Red, M80, MOLE, Prospector, Railen, Starlite,
 * UTV, Vulture) already bareHullName-match their deep-import counterpart
 * without any override. Maps a seed ShipDefinition's own id to the raw
 * StarBreaker entity class its real deep-import counterpart resolves as.
 */
const SEED_HULL_GROUP_ALIASES: Record<string, string> = {
  ghost: 'ANVL_Hornet_F7CS_Mk2',
}

function groupKeyFor(d: ShipDefinition): string {
  const aliasTargetEntityClass = SEED_HULL_GROUP_ALIASES[d.id]
  if (aliasTargetEntityClass) {
    const aliasedDefinition = importedShipList.find((v) => v.ship.sourceEntityClass === aliasTargetEntityClass)
    if (aliasedDefinition) {
      const definition = importedDefinitions.find((imp) => imp.id === aliasedDefinition.ship.id)
      if (definition) return bareHullName(definition).toLowerCase().trim()
    }
  }
  return bareHullName(d).toLowerCase().trim()
}

const hullGroups = new Map<string, ShipDefinition[]>()
for (const d of allDefinitions) {
  const key = groupKeyFor(d)
  if (!hullGroups.has(key)) hullGroups.set(key, [])
  hullGroups.get(key)!.push(d)
}

/** Non-canonical id -> canonical id, populated for two safe cases:
 * (1) the superseded definition is a bare Mission M-012 catalog
 * placeholder (rank 2) with no data of its own to lose; (2) the
 * superseded definition is a seed fixture (rank 1) whose real hull has
 * since been deep-imported (rank 0) — see the aliasing loops below, which
 * reuse this to let an existing FleetAsset on a delisted id self-heal to
 * the canonical definition's real data on its next rehydration replay,
 * the same mechanism ADR-006 established for deep-import identity
 * aliasing. Case (2) (Corsair, Cutlass Black, and every seed-backed
 * Golden Fleet promotion candidate — MOLE, Railen, Vulture, Ghost, etc.)
 * was deliberately EXCLUDED prior to EWO-043/MWO-001: silently remapping
 * a seed ship's hand-authored port/slot structure onto the deep-import's
 * differently-shaped real tree risked orphaning a Commander's existing
 * custom Loadout with no safety net. EWO-043's reconciliation engine
 * (src/utils/fleetAssetReconciliation.ts) removed that risk — a template
 * change (including this kind of supersession) now migrates Commander
 * Installed/Target assignments forward, quarantining only what genuinely
 * has no match — so aliasing case (2) is now safe and is what actually
 * lets a Commander's EXISTING seed-migrated ship (not just a freshly
 * Added one) pick up real mining/tractor/salvage/turret equipment after
 * a Golden Fleet promotion. See docs/ADR/ADR-008-Canonical-Ship-Definition.md
 * for the original rationale this supersedes.
 */
const supersededByCanonical = new Map<string, string>()
const canonicalIds = new Set<string>()

/** A definition's own id, unless it's deep-imported — in which case its
 * raw StarBreaker entity class (e.g. "DRAK_Cutlass_Black") is used, since
 * that's the stable, human-legible id ADR-006/ADR-008 already alias to
 * the same definition and the one a Commander-facing registry uses. */
function imageKeyFor(d: ShipDefinition): string {
  const importedView = importedShipList.find((v) => v.ship.id === d.id)
  return importedView?.ship.sourceEntityClass ?? d.id
}

/**
 * EWO-021A-1 — every definition id (seed, deep-imported, or a superseded
 * catalog placeholder) -> the image-lookup key of its hull group's
 * canonical (richest) definition. Presentation-only: unlike
 * `supersededByCanonical` above, this is populated for EVERY member of a
 * hull group, including the deliberately-unaliased seed-vs-deep-import
 * case (Corsair, Cutlass Black) — a seed ship's hand-authored loadout
 * stays its own engineering identity forever (see supersededByCanonical's
 * doc comment), but there is no equivalent data-loss risk in simply
 * showing the same real hull's photo on both. Consumed by
 * src/utils/resolveShipImage.ts so a historical seed FleetAsset picks up
 * the same registry entry a freshly-added canonical FleetAsset would.
 */
export const presentationImageKeyById: Map<string, string> = new Map()

for (const group of hullGroups.values()) {
  const sorted = [...group].sort((a, b) => definitionCompletenessRank(a) - definitionCompletenessRank(b) || a.id.localeCompare(b.id))
  const canonical = sorted[0]
  canonicalIds.add(canonical.id)
  const canonicalImageKey = imageKeyFor(canonical)
  for (const member of sorted) {
    presentationImageKeyById.set(member.id, canonicalImageKey)
  }
  for (const superseded of sorted.slice(1)) {
    const supersededRank = definitionCompletenessRank(superseded)
    const canonicalRank = definitionCompletenessRank(canonical)
    // MWO-001 (Task 2) — case (2) above: a seed definition (rank 1)
    // superseded by a deep-import (rank 0) is now safe to alias, since
    // EWO-043's reconciliation engine protects Commander intent across
    // exactly this kind of template change.
    if (supersededRank === 2 || (supersededRank === 1 && canonicalRank === 0)) {
      supersededByCanonical.set(superseded.id, canonical.id)
    }
  }
}

/** Every valid ship definition — the seed fleet's models, every
 * deep-imported ship definition, and every catalog-only ship/ground
 * vehicle (Mission M-012) — canonical AND non-canonical alike, sorted
 * alphabetically. This is the full registry: anything that needs to know
 * "is this a real ship definition id" (validation, diagnostics) should
 * use this, not `selectableShipDefinitions` below, since a FleetAsset
 * already referencing a superseded id is still perfectly valid and must
 * never be flagged as broken by EWO-021's picker de-duplication. */
export const shipDefinitions: ShipDefinition[] = [...allDefinitions].sort((a, b) => a.displayName.localeCompare(b.displayName))

/**
 * EWO-021 (Task 3, Fleet Picker Normalization) — the subset of
 * `shipDefinitions` that "Add Ship" should offer: exactly one entry per
 * real hull, the best-ranked (`definitionCompletenessRank`) definition in
 * each `bareHullName` group. Every other application subsystem (Fleet
 * Dashboard, Mission Control, Ship Detail, Loadout Manager, ...) resolves
 * ship identity for an *existing* FleetAsset via `shipDefinitionById`
 * instead, which still recognizes every id, canonical or not — only the
 * picker itself needs a de-duplicated list, since it is the only place a
 * Commander chooses *among* several definitions rather than looking up
 * one they already committed to.
 */
export const selectableShipDefinitions: ShipDefinition[] = allDefinitions
  .filter((d) => canonicalIds.has(d.id))
  .sort((a, b) => a.displayName.localeCompare(b.displayName))

/**
 * Resolves a ShipDefinition by id, plus one alias per deep-imported ship:
 * its canonical raw entity class (e.g. "AEGS_Eclipse"). A FleetAsset added
 * while a ship was still catalog-only persists that canonical class as its
 * `shipDefinitionId` (see catalogDefinitions above, where `id: r.entityClass`).
 * If that ship is later deep-imported, its generated id changes (e.g.
 * "eclipse-imported") — without this alias, the existing FleetAsset's
 * `shipDefinitionId` would silently stop resolving to anything. Aliasing
 * both keys to the same rich definition object lets an already-persisted
 * FleetAsset pick up real port/factory data on its next read, with no
 * change to the persisted record itself and no duplicate entry in
 * `shipDefinitions` (Add Ship still lists the ship exactly once).
 *
 * Built from `allDefinitions` (every definition, canonical or not) rather
 * than the filtered `shipDefinitions` picker list — EWO-021's
 * non-canonical duplicates must keep resolving for any FleetAsset that
 * already references one; they are only removed from the *selectable*
 * list above.
 */
export const shipDefinitionById: Map<string, ShipDefinition> = new Map(allDefinitions.map((d) => [d.id, d]))
for (const v of importedShipList) {
  const canonicalId = v.ship.sourceEntityClass
  const definition = importedDefinitions.find((d) => d.id === v.ship.id)
  if (canonicalId && definition && !shipDefinitionById.has(canonicalId)) {
    shipDefinitionById.set(canonicalId, definition)
  }
}

// EWO-021: a FleetAsset already referencing a *safely* superseded
// catalog-only placeholder (see supersededByCanonical's doc comment
// above) resolves straight through to the canonical definition instead —
// self-healing to real data on its next rehydration replay, exactly like
// ADR-006's sourceEntityClass aliasing. Never applied to a seed
// definition superseded by a deep-import (deliberately excluded when
// supersededByCanonical was built).
for (const [supersededId, canonicalId] of supersededByCanonical.entries()) {
  const canonicalDefinition = shipDefinitionById.get(canonicalId)
  if (canonicalDefinition) shipDefinitionById.set(supersededId, canonicalDefinition)
}

/**
 * EWO-025 — this previously dropped `isStructural` (and `groupLabel`/
 * `assemblyRole`) when building a seed ship's canonical template,
 * silently discarding hierarchy data the hand-authored seed fixture
 * itself already carries (see e.g. Ghost's own `customRow(...,
 * { isStructural: true })` in src/data/seed.ts) — the exact same class of
 * bug this mission fixes for saved Builds, just one layer upstream. Seed
 * fixtures predate EWO-019B/EWO-020's category-grouping work and were
 * never authored with `groupLabel`/`assemblyRole`, so those two remain
 * `undefined` here (an honest gap in the source fixture, not invented
 * data) — but `isStructural` already exists on every seed row that needs
 * it and must be passed through.
 */
function seedFactoryTemplate(shipId: string): FactoryHardpointTemplate[] {
  const ship = seedShips.find((s) => s.id === shipId)
  if (!ship) return []
  return seedHardpoints
    .filter((h) => h.buildId === ship.activeBuildId)
    .map((h) => ({
      slotLabel: h.slotLabel,
      type: h.type,
      size: h.size,
      factoryItem: h.factoryItem,
      parentSlotLabel: h.parentSlotLabel,
      groupLabel: h.groupLabel,
      assemblyRole: h.assemblyRole,
      isStructural: h.isStructural,
    }))
}

/**
 * Builds one template row per authoritative normalized Port — every
 * physical port from the normalized pipeline (`view.ports`), not the
 * collapsed one-row-per-mount `equipmentAssignments` view (Mission
 * M-011). Using the collapsed view here was the root cause of Loadout
 * Manager never being able to target a mount's child weapon/missile/
 * jump-drive slots at all: a materialized FleetAsset's hardpoints came
 * from `equipmentAssignments` alone, so the underlying child ports never
 * existed as their own rows once a Fleet Asset was created from this
 * template.
 *
 * The existing `Hardpoint`/`buildPortTree` mechanism (Alpha 2.5C) links
 * parent->child purely by matching `parentSlotLabel` against the
 * parent's own `slotLabel` string — there is no ID-based link. Real
 * normalized port `displayName`s are NOT unique across different parents
 * (confirmed directly against the generated catalog: every Gladius
 * weapon mount's child gun port is literally named "Class 2", and every
 * missile rack's first child is "01 Attach Missile") — joining on the
 * raw displayName would silently merge unrelated subtrees the moment any
 * of them gained their own children. Each port's template `slotLabel` is
 * therefore built top-down as `<parent's already-unique label> — <this
 * port's displayName>`, which is unique by construction (top-level
 * labels are the ship's own distinct hardpoint names) without inventing
 * or guessing anything — every segment is still a real, authoritative
 * displayName, just disambiguated by real tree position rather than
 * joined on a colliding raw string. `Hardpoint.id`/`Port.id` (the
 * genuinely stable canonical id) is preserved unchanged as the row's own
 * `id` in `materializeFleetAsset` regardless of this label.
 */
/**
 * EWO-023 (Task 5) — a mount/turret/rack Port's own `displayName` is
 * generated purely from its raw port name (src/normalizer/displayNameGenerator.ts),
 * which often reads exactly like the equipment it holds (e.g. a Gimbal
 * Mount literally named "Nose Class2 Weapon") — the tree itself already
 * correctly nests a distinct structural row above its child gun/missile/
 * tool (confirmed against generated-data/ports.json), but nothing in
 * either row's own text said "mount," so an intact hierarchy read as a
 * skipped level ("Weapon > Class 2" with nothing mount-like between
 * them). Suffixing the port's own already-computed, source-evidenced
 * AssemblyRole (src/normalizer/assemblyRole.ts) — never invented or
 * hardcoded per-ship — makes the structural row's real physical nature
 * explicit. Applies uniformly to every current and future deep-imported
 * ship (Mining Heads/Salvage Heads/Tractor Beams included, once any ship
 * with those assembly roles is imported) since it derives from the role
 * enum, not a per-ship or per-category special case.
 */
const MOUNT_ROLE_LABEL: Partial<Record<string, string>> = {
  GIMBAL_MOUNT: 'Gimbal Mount',
  DIRECT_WEAPON_MOUNT: 'Weapon Mount',
  MANNED_TURRET: 'Manned Turret',
  REMOTE_TURRET: 'Remote Turret',
  GENERIC_MOUNT: 'Mount',
  MISSILE_RACK: 'Missile Rack',
}

/**
 * `hasChildren` is the deciding signal, not `assemblyRole` alone —
 * `deriveAssemblyRole` (src/normalizer/assemblyRole.ts) assigns
 * GENERIC_MOUNT to *any* port whose entity class doesn't match a known
 * mount/turret naming pattern, including a plain terminal Power Plant or
 * Cooler port that simply isn't turret/mount-shaped by name (confirmed
 * against generated-data/ports.json: Avenger Titan's own "Power Plant"
 * port carries `assemblyRole: "GENERIC_MOUNT"`). Suffixing every
 * GENERIC_MOUNT row regardless would mislabel ordinary equipment as
 * "(Mount)". Only a port that is actually a structural parent in the
 * tree — has at least one child row — is the kind of node this mission's
 * hierarchy-clarity fix is about.
 */
function presentationLabelFor(port: { displayName: string; assemblyRole?: string }, hasChildren: boolean): string {
  if (!hasChildren) return port.displayName
  const roleLabel = port.assemblyRole ? MOUNT_ROLE_LABEL[port.assemblyRole] : undefined
  if (!roleLabel) return port.displayName
  return port.displayName.toLowerCase().includes(roleLabel.toLowerCase()) ? port.displayName : `${port.displayName} (${roleLabel})`
}

/**
 * EWO-023 (Task 6, follow-on fix) — `Port.equipmentGroup` (e.g. "Power",
 * "Weapons", "Missiles" — a plural UI-organizational bucket, see
 * src/engine/types/equipmentGroup.ts) was being used directly as a
 * `FactoryHardpointTemplate`'s compatibility `type`, but
 * `validateTargetCompatibility` (src/data/componentCatalog.ts) and the
 * component catalog it checks against (`catalogComponentsByName`, via
 * `CATEGORY_TO_PORT_TYPE`) both use a different, singular category
 * vocabulary ("Power Plant", "Cooler", "Shield", "Weapon", "Missile
 * Rack", "Quantum Drive") — the same vocabulary seed ships' own
 * hand-authored `type` fields already use (src/data/seed.ts's `SLOTS`).
 *
 * This mismatch existed before EWO-023 but was silent: a deep-imported
 * component's `factoryItem`/`targetItem` was itself an unresolved,
 * raw-identifier-shaped string (the Task 6 bug), which never matched any
 * `catalogComponentsByName` key at all, so `validateTargetCompatibility`
 * always short-circuited to "valid — nothing to check" before the type
 * comparison could run. Fixing Task 6 made the item names resolvable,
 * which for the first time actually exercised this type comparison — and
 * exposed it comparing "Power" against "Power Plant", flagging nearly
 * every real component on every deep-imported ship as falsely
 * incompatible. Translating equipmentGroup (further disambiguated by the
 * already-computed, source-evidenced AssemblyRole for the Weapons/
 * Missiles groups, which hold more than one distinct terminal type) into
 * the same vocabulary seed ships already use closes that gap. Falls back
 * to the equipmentGroup string unchanged for any group with no
 * meaningful terminal-type translation (Avionics, Cargo, Customization,
 * Defense — categories no currently-imported ship uses) rather than
 * guessing one.
 *
 * FTB-001D — "Mining" was on that fallback list too, believed unused; it
 * is not. Every real mining weapon port across every currently-imported
 * mining ship (MOLE, Prospector, ROC, Golem — 14 real ports, confirmed by
 * direct audit of generated-data/ports.json) carries `equipmentGroup:
 * "Mining"`, `assemblyRole: "GENERIC_MOUNT"` (not one of the branches
 * above), so every one of them fell through to the raw, untranslated
 * "Mining" string — permanently mismatched against
 * `CATEGORY_TO_PORT_TYPE.WeaponMining` ("Mining Laser", the same
 * vocabulary every mining laser's catalog record resolves to). A mining
 * laser with no hand-authored src/data/componentCatalog.ts override
 * forcing its category to the wrong-but-matching "Mining" could never be
 * offered on any real mining port — confirmed for Helix I/II and, by the
 * same root cause, every other real mining laser with no such override
 * (Impact I/II, Lancet MH1/MH2, Klein-S1/S2, Hofstede-S1/S2). Translated
 * here instead, the same way every other equipmentGroup already is — the
 * generic, per-name overrides this previously required become unnecessary
 * (removed alongside this fix, see componentCatalog.ts).
 *
 * FTB-001E — "Salvage" had the exact same latent defect as "Mining" did:
 * every real salvage head port (Reclaimer, Vulture, MOTH, Fortune) fell
 * through to the raw, untranslated "Salvage" string, patched only for the
 * salvage HEAD itself via hand-authored overrides ('Baler Salvage Head',
 * 'Salvation Salvage Head' — removed alongside this fix).
 *
 * FTB-001F — FTB-001E also tried to distinguish the salvage head's own
 * scraper/tractor CHILD sub-items (which share the identical raw
 * "Salvage" equipmentGroup as the head and as each other) by reading the
 * port's FACTORY-INSTALLED component's own subtype — i.e., inferring
 * socket capability from whatever happened to be installed there. SPPV
 * field validation proved that wrong: the real game accepts ANY salvage
 * modifier (Abrade, Cinch, Trawler, ReadyGrip) in EITHER child socket,
 * and src/normalizer/classificationTranslator.ts's own already-reviewed
 * EWO-041/CWO-001 rule had already explicitly found "no distinction
 * meaningful to SFM's own model" between SalvageModifier subtypes.
 * The genuinely correct signal — the one already-computed, structural,
 * NEVER-derived-from-what's-currently-installed fact that DOES
 * distinguish "this is the head port" from "this is a child modifier
 * socket" — is the port's own `canonicalPortType` (src/engine/types/port.ts),
 * set once at ship-import time by that same classification layer:
 * "SalvageHead" for the head, "SalvageModule" for every child socket
 * uniformly, regardless of which modifier is factory-installed there.
 *
 * VRF-002 — the Greycat MTC's own manned turret port carries
 * assemblyRole "MANNED_TURRET" (caught below), but the identical real
 * turret-shell hardware (`ANVL_Fixed_Mount_Hornet_Ball_S4`, catalog
 * category "Turret") is ALSO factory-installed on ports whose own
 * assemblyRole is the generic "GENERIC_MOUNT" (e.g. the Hornet F7C
 * Wildfire's "Class 4 Center" mount, the F7CM Heartseeker's "Center
 * Weapon" mount) — 61 real ports fleet-wide share this exact shape
 * (confirmed by direct audit: Freelancer, Starfarer, Starlancer Max/TAC,
 * Reliant Mako/Sen/Tana, Mustang Gamma/Omega, Ironclad, Perseus, Ursa
 * Rover/Medivac, Cyclone MT, Storm AA, San'tok.yāi, Pulse, and MTC itself
 * all install a Turret/TurretBase-category component into a
 * GENERIC_MOUNT-role port). Falling through the switch below with no
 * further signal, these previously resolved to the raw, untranslated
 * equipmentGroup string ("Weapons"/"Defense") — this went unnoticed only
 * because CATEGORY_TO_PORT_TYPE had no "Turret" entry either (see
 * src/generated/componentCatalog.ts), so the mismatch was silently
 * masked by validateTargetCompatibility's permissive "unresolved"
 * fallback rather than a genuine, verified match. Now that Turret
 * candidates resolve for real, the port's own type must too — but ONLY
 * via the factory component's own real catalog category, checked as a
 * narrow fallback AFTER the assemblyRole switch fails to classify it,
 * never by broadening the equipmentGroup switch itself (equipmentGroup
 * "Weapons"/"Defense" is also shared by genuinely unrelated GENERIC_MOUNT
 * ports — tractor beam arms, category "ToolArm" — that must never be
 * relabeled "Gimbal Mount"). This is not "inferring socket capability
 * from installed contents" in the sense FTB-001F rejected: unlike a
 * salvage child socket (which genuinely accepts several interchangeable
 * modifier families), a fixed turret-shell mount never has an
 * alternative, differently-shaped part it could equally accept — the
 * factory category here is a stable fact about the PORT, not a
 * transient one about a swappable occupant.
 */
function compatibilityTypeFor(port: {
  equipmentGroup: string
  assemblyRole?: string
  canonicalPortType?: string
  factoryComponentCategory?: string | null
}): string {
  // FTB-001F — see this function's own doc comment above: a child salvage
  // modifier socket's canonicalPortType is "SalvageModule" regardless of
  // which real modifier (scraper or tractor) is currently installed —
  // checked before the generic equipmentGroup switch below so it always
  // wins for these specific sub-ports without affecting the salvage head
  // port itself (canonicalPortType "SalvageHead", handled by the ordinary
  // 'Salvage' -> 'Salvage Module' case further down).
  if (port.canonicalPortType === 'SalvageModule') return 'Salvage Modifier'
  switch (port.assemblyRole) {
    case 'WEAPON':
      return 'Weapon'
    case 'MISSILE':
    case 'MISSILE_SLOT':
      return 'Missile'
    case 'MISSILE_RACK':
      return 'Missile Rack'
    case 'QUANTUM_DRIVE':
      return 'Quantum Drive'
    case 'JUMP_MODULE':
      return 'Jump Drive'
    // A mount/turret row's own hardware component (e.g. "Turret",
    // "VariPuck S3 Gimbal Mount") — when it isn't isStructural and
    // carries a real factoryItem of its own — resolves through the bulk
    // catalog's DataCore category "WeaponMount", which CATEGORY_TO_PORT_TYPE
    // (src/generated/componentCatalog.ts) always translates to "Gimbal
    // Mount" regardless of the finer gimbal/turret/direct-mount
    // distinction AssemblyRole itself draws (confirmed against
    // generated-data/component-metadata-catalog.json: a Valkyrie door
    // "Turret" component is category WeaponMount even though its own
    // AssemblyRole is DIRECT_WEAPON_MOUNT, not GIMBAL_MOUNT). Matching the
    // catalog's own coarser vocabulary here — not inventing a finer one it
    // doesn't have — is what actually resolves against real data.
    case 'GIMBAL_MOUNT':
    case 'DIRECT_WEAPON_MOUNT':
    case 'MANNED_TURRET':
    case 'REMOTE_TURRET':
      return 'Gimbal Mount'
  }
  // VRF-002 — see this function's own doc comment above: a turret-shell
  // hardware component (catalog category "Turret"/"TurretBase") factory-
  // installed on a port whose assemblyRole didn't already resolve above
  // (typically GENERIC_MOUNT) still fills a genuine Gimbal Mount-shaped
  // port. Never triggers for any other category sharing the same
  // equipmentGroup (e.g. a tractor beam arm's "ToolArm").
  if (port.factoryComponentCategory === 'Turret' || port.factoryComponentCategory === 'TurretBase') return 'Gimbal Mount'
  switch (port.equipmentGroup) {
    case 'Power':
      return 'Power Plant'
    case 'Coolers':
      return 'Cooler'
    case 'Shields':
      return 'Shield'
    case 'Radar':
      return 'Radar'
    case 'Relays':
      return 'Relay'
    case 'LifeSupport':
      return 'Life Support'
    case 'Mining':
      return 'Mining Laser'
    case 'Salvage':
      return 'Salvage Module'
    default:
      return port.equipmentGroup
  }
}

function importedFactoryTemplate(shipId: string): FactoryHardpointTemplate[] {
  const view = importedShipList.find((v) => v.ship.id === shipId)
  if (!view) return []

  const ports = view.ports
  const componentById = view.componentById
  type PortT = (typeof ports)[number]

  const childrenByParentId = new Map<string | null, PortT[]>()
  for (const p of ports) {
    const key = p.parentPortId ?? null
    if (!childrenByParentId.has(key)) childrenByParentId.set(key, [])
    childrenByParentId.get(key)!.push(p)
  }

  const factoryItemFor = (p: PortT) => (p.factoryItemId ? componentById.get(p.factoryItemId)?.displayName ?? 'Unknown Factory Item' : '—')
  // EWO-STAB-004A — the same already-resolved component record
  // factoryItemFor reads its displayName from also carries the exact
  // entityClass (Component.internalName) — read here directly rather than
  // ever re-deriving it from the display name later.
  const factoryEntityClassFor = (p: PortT) => (p.factoryItemId ? componentById.get(p.factoryItemId)?.internalName : undefined)
  // VRF-002 — the factory-installed component's own real catalog category
  // (via the generated catalog, entityClass-keyed — never a display-name
  // guess), used only as compatibilityTypeFor's narrow Turret/TurretBase
  // fallback when assemblyRole alone doesn't already classify the port.
  const factoryComponentCategoryFor = (p: PortT) => {
    const entityClass = factoryEntityClassFor(p)
    return entityClass ? (componentsByEntityClass.get(entityClass)?.category ?? undefined) : undefined
  }

  const rows: FactoryHardpointTemplate[] = []
  function walk(port: PortT, uniqueParentLabel: string | undefined, groupLabel: string | undefined) {
    const hasChildren = (childrenByParentId.get(port.id) ?? []).length > 0
    const displayLabel = presentationLabelFor(port, hasChildren)
    const uniqueLabel = uniqueParentLabel ? `${uniqueParentLabel} — ${displayLabel}` : displayLabel
    rows.push({
      slotLabel: uniqueLabel,
      type: compatibilityTypeFor(port.isStructural ? port : { ...port, factoryComponentCategory: factoryComponentCategoryFor(port) }),
      size: port.minSize !== null ? `S${port.minSize}` : 'S1',
      factoryItem: port.isStructural ? '—' : factoryItemFor(port),
      factoryEntityClass: port.isStructural ? undefined : factoryEntityClassFor(port),
      parentSlotLabel: uniqueParentLabel,
      groupLabel,
      assemblyRole: port.assemblyRole,
      isStructural: port.isStructural,
      sourcePortId: port.id,
    })
    for (const child of childrenByParentId.get(port.id) ?? []) {
      // A group applies only to the top-level row it was resolved for —
      // its own children already nest beneath it via parentSlotLabel, so
      // they don't need (and shouldn't repeat) the group tag themselves.
      walk(child, uniqueLabel, undefined)
    }
  }
  for (const top of childrenByParentId.get(null) ?? []) {
    walk(top, undefined, topLevelGroupLabel(top))
  }

  return rows
}

/**
 * EWO-020 (superseding EWO-019B's more conservative version) — the fixed,
 * player-oriented top-level system category for a top-level physical
 * port, used to add a synthetic header above otherwise-independent
 * sibling ports. Order matches the Chief-Architect-approved category list
 * (Core Systems, Detection/Navigation, Weapons, Manned Turrets, Remote
 * Turrets, Ordnance, Utility Systems, Support Systems) — enforced by
 * `topLevelGroupOrder` below, not by insertion order here.
 *
 * EWO-019B could not separate Manned/Remote Turrets from plain weapon
 * mounts because the signal that distinguishes them (a mount's own raw
 * entity class) was being discarded during normalization. EWO-020 fixed
 * that upstream (src/normalizer/shipNormalizer.ts preserves a structural
 * parent node with a source-evidenced `assemblyRole` — see
 * src/normalizer/assemblyRole.ts) — this function now consumes that real
 * signal instead of only `equipmentGroup`. A port whose category isn't
 * one of the eight below (Customization, Cargo, Avionics, ...) is left
 * ungrouped rather than forced into an approximate bucket.
 */
function topLevelGroupLabel(port: { equipmentGroup: string; assemblyRole?: string }): string | undefined {
  const { equipmentGroup: group, assemblyRole: role } = port

  if (group === 'Power' || group === 'Coolers' || group === 'Shields') return 'Core Systems'
  if (group === 'Radar' || group === 'QuantumDrive') return 'Detection / Navigation'
  if (role === 'MANNED_TURRET') return 'Manned Turrets'
  if (role === 'REMOTE_TURRET') return 'Remote Turrets'
  if (group === 'Weapons') return 'Weapons'
  if (group === 'Missiles') return 'Ordnance'
  if (group === 'Mining' || group === 'Salvage' || group === 'Utility') return 'Utility Systems'
  if (group === 'Relays' || group === 'LifeSupport') return 'Support Systems'
  return undefined
}

/** The Chief-Architect-approved fixed display order for top-level system
 * categories (Task 10) — guidance for *known* categories only; a group
 * label not listed here (there are none today, since `topLevelGroupLabel`
 * only ever produces one of these eight) sorts after all known ones,
 * stable otherwise. Consumed by `src/utils/portTreeGrouping.ts`. */
export const TOP_LEVEL_GROUP_ORDER: string[] = [
  'Core Systems',
  'Detection / Navigation',
  'Weapons',
  'Manned Turrets',
  'Remote Turrets',
  'Ordnance',
  'Utility Systems',
  'Support Systems',
]

/** Factory hardpoint template per ShipDefinition id — see FactoryHardpointTemplate.
 * Built from `allDefinitions` (not the filtered `shipDefinitions` picker
 * list — EWO-021), so a non-canonical id still materializes correctly for
 * any FleetAsset already referencing it. */
export const shipFactoryTemplates: Record<string, FactoryHardpointTemplate[]> = Object.fromEntries(
  allDefinitions.map((d) => [d.id, d.sourceMetadata.sourceType === 'seed' ? seedFactoryTemplate(d.id) : importedFactoryTemplate(d.id)])
)

// Same canonical-entity-class alias as shipDefinitionById above, so a
// persisted FleetAsset added while its ship was still catalog-only (whose
// shipDefinitionId is the canonical class, e.g. "AEGS_Eclipse") resolves
// to the real deep-imported template — not the `?? []` empty fallback —
// the next time useFleetStore's rehydration replay materializes it.
for (const v of importedShipList) {
  const canonicalId = v.ship.sourceEntityClass
  if (canonicalId && !(canonicalId in shipFactoryTemplates)) {
    shipFactoryTemplates[canonicalId] = importedFactoryTemplate(v.ship.id)
  }
}

// EWO-021: mirrors shipDefinitionById's safe-supersession aliasing — a
// FleetAsset referencing a delisted catalog-only placeholder id
// materializes with the canonical definition's real template on its next
// replay, not an empty one.
for (const [supersededId, canonicalId] of supersededByCanonical.entries()) {
  if (canonicalId in shipFactoryTemplates) {
    shipFactoryTemplates[supersededId] = shipFactoryTemplates[canonicalId]
  }
}
