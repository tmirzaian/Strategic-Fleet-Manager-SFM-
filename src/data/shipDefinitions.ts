import type { ShipDefinition } from '../types'
import { ships as seedShips, hardpoints as seedHardpoints } from './seed'
import { importedShipList } from '../generated/importedShips'
import { shipCatalogRecords } from '../generated/shipCatalog'
import { classificationFor } from './shipClassification'

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
}

const seedDefinitions: ShipDefinition[] = seedShips.map((s) => ({
  id: s.id,
  internalName: s.id,
  displayName: s.name,
  manufacturer: s.manufacturer,
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
  displayName: v.ship.name,
  manufacturer: v.ship.manufacturer,
  classification: classificationFor(v.ship.id),
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
    manufacturer: r.manufacturer?.name ?? r.manufacturer?.code ?? 'Unknown',
    classification: classificationFor(r.entityClass),
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
 */
function bareHullName(d: ShipDefinition): string {
  if (d.sourceMetadata.sourceType === 'StarBreaker' && d.sourceMetadata.sourceFile === 'ship-catalog') {
    const firstWord = d.displayName.split(' ')[0]
    if (firstWord && d.manufacturer.toLowerCase().startsWith(firstWord.toLowerCase())) {
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
const hullGroups = new Map<string, ShipDefinition[]>()
for (const d of allDefinitions) {
  const key = bareHullName(d).toLowerCase().trim()
  if (!hullGroups.has(key)) hullGroups.set(key, [])
  hullGroups.get(key)!.push(d)
}

/** Non-canonical id -> canonical id, populated only for the *safe* case:
 * the superseded definition is a bare Mission M-012 catalog placeholder
 * (rank 2) with no data of its own to lose — see the aliasing loops
 * below, which reuse this to let an existing FleetAsset on a delisted
 * catalog-only id self-heal to the canonical definition's real data on
 * its next rehydration replay, the same mechanism ADR-006 established for
 * deep-import identity aliasing. A seed definition superseded by a
 * deep-import (Corsair, Cutlass Black) is deliberately NOT aliased here —
 * a seed ship's hand-authored port/slot structure is fictionally its own,
 * and a Commander-added FleetAsset that happened to reference it could
 * carry a custom Loadout built against those exact slot labels; silently
 * remapping it onto the deep-import's differently-shaped real port tree
 * risks orphaning that customization, which no completeness gain
 * justifies. See docs/ADR/ADR-008-Canonical-Ship-Definition.md.
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
    if (definitionCompletenessRank(superseded) === 2) {
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

function seedFactoryTemplate(shipId: string): FactoryHardpointTemplate[] {
  const ship = seedShips.find((s) => s.id === shipId)
  if (!ship) return []
  return seedHardpoints
    .filter((h) => h.buildId === ship.activeBuildId)
    .map((h) => ({ slotLabel: h.slotLabel, type: h.type, size: h.size, factoryItem: h.factoryItem, parentSlotLabel: h.parentSlotLabel }))
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

  const rows: FactoryHardpointTemplate[] = []
  function walk(port: PortT, uniqueParentLabel: string | undefined, groupLabel: string | undefined) {
    const uniqueLabel = uniqueParentLabel ? `${uniqueParentLabel} — ${port.displayName}` : port.displayName
    rows.push({
      slotLabel: uniqueLabel,
      type: port.equipmentGroup,
      size: port.minSize !== null ? `S${port.minSize}` : 'S1',
      factoryItem: port.isStructural ? '—' : factoryItemFor(port),
      parentSlotLabel: uniqueParentLabel,
      groupLabel,
      assemblyRole: port.assemblyRole,
      isStructural: port.isStructural,
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
