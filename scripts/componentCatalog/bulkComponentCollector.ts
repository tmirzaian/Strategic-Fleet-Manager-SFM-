import { isPlayerUsableComponentType } from './componentTaxonomy'
import { parseManufacturerReference } from '../universeCatalog/manufacturerResolver'
import { resolveLocalizedName } from '../universeCatalog/localization'
import { parseBulkNumber } from '../universeCatalog/dcbBulkQuery'
import { parseDescriptionHeader, extractOperationalIdentityValue } from './descriptionClassification'
import type { CatalogRecord, UnresolvedEntry } from './catalogSchema'

export interface ComponentFieldMaps {
  type: Map<string, string>
  subType: Map<string, string>
  size: Map<string, string>
  grade: Map<string, string>
  manufacturerCode: Map<string, string>
  manufacturerLocKey: Map<string, string>
  localizationName: Map<string, string>
  /** CAT-001 (Objective 1) — the item's localized description key
   * (`AttachDef.Localization.Description`), resolved the same way as
   * `localizationName`. Its text carries the Classification/Grade header
   * block parsed by `descriptionClassification.ts`. */
  localizationDescriptionKey: Map<string, string>
  /** SW-013C.2F Amendment A (Finding 2) — `AttachDef.RequiredTags`,
   * raw space-separated string (e.g. "gama_railen", "miningMount", ""). */
  requiredTags: Map<string, string>
  /** SW-013C.2F Amendment A (Finding 2) — `AttachDef.Tags`, raw
   * space-separated string (e.g. "flightReady $gama_railen"). Used
   * alongside `requiredTags` to derive `vesselBoundTags` — see
   * catalogSchema.ts's schemaVersion 4 note. */
  tags: Map<string, string>
}

export interface BulkComponentCollectionResult {
  records: Map<string, CatalogRecord>
  unresolved: UnresolvedEntry[]
}

/**
 * Builds one catalog record for a single entity class directly from the
 * shared bulk field-query maps — no per-entity StarBreaker spawn. Returns
 * `null` when `fields.type` has no entry for this entity class at all
 * (StarBreaker never emitted a line for it — a field legitimately absent,
 * per dcbBulkQuery.ts's own contract), the same "genuinely unresolved"
 * signal the old per-entity `dcb query` path expressed via its
 * `not-found` outcome.
 *
 * FTB-001F (Part C, generator optimization) — this is the one shared
 * extraction path both the full-universe bulk walk (`collectBulkComponents`
 * below) and `scripts/generateComponentCatalog.ts`'s narrow, raw-data-
 * fixture-scoped resolution now both call, so a given entity class always
 * resolves to the exact same record regardless of which of the two
 * discovery walks reaches it first — never two independently-maintained
 * extraction rules that could quietly drift apart.
 */
export function buildRecordFromBulkFields(entityClass: string, fields: ComponentFieldMaps, localizationTable: Map<string, string>): CatalogRecord | null {
  const type = fields.type.get(entityClass)
  if (type === undefined) return null

  const subtype = fields.subType.get(entityClass) ?? null
  const size = parseBulkNumber(fields.size.get(entityClass))
  const grade = parseBulkNumber(fields.grade.get(entityClass))
  const manufacturerRef = parseManufacturerReference(fields.manufacturerCode.get(entityClass), fields.manufacturerLocKey.get(entityClass))
  const localizationKey = fields.localizationName.get(entityClass) ?? null

  // CAT-001 (Objective 1/2) — the same localization-key-resolution path
  // `displayName` already uses, applied to the description key instead.
  // Grade is deliberately NOT read out of this text here: the structured
  // `grade` field above is always authoritative (Objective 3) — any
  // description-text/structured-Grade disagreement is a diagnostics-only
  // concern, computed separately in generateComponentCatalog.ts so this
  // record-builder stays a pure, single-record function.
  const descriptionKey = fields.localizationDescriptionKey.get(entityClass) ?? null
  const descriptionText = resolveLocalizedName(descriptionKey, localizationTable)
  // CAT-002 — family-aware: Core reads "Class", Weapon reads "Item Type",
  // Missile reads "Tracking Signal"; every other category stays null.
  const classification = extractOperationalIdentityValue(parseDescriptionHeader(descriptionText), type)

  // SW-013C.2F Amendment A (Finding 2) — a required tag is vessel-bound
  // only when this SAME entity's own Tags also carries it with a "$"
  // prefix (CIG's self-referential loadout-group marker convention) — see
  // catalogSchema.ts's schemaVersion 4 note for the full rationale
  // (RequiredTags alone also covers ordinary shared requirements like
  // "miningMount", which must NOT be treated as vessel-bound).
  const requiredTagsRaw = fields.requiredTags?.get(entityClass) ?? ''
  const requiredTagsList = requiredTagsRaw.split(/\s+/).filter((t) => t.length > 0)
  const ownTagsRaw = fields.tags?.get(entityClass) ?? ''
  const ownTags = new Set(ownTagsRaw.split(/\s+/).filter((t) => t.length > 0))
  const vesselBoundTags = requiredTagsList.filter((t) => ownTags.has(`$${t}`))

  return {
    entityClass,
    recordName: `EntityClassDefinition.${entityClass}`,
    category: type,
    subtype: subtype && subtype !== 'UNDEFINED' ? subtype : null,
    size,
    grade,
    manufacturerRef: manufacturerRef?.code ?? null,
    localizationKey,
    displayName: resolveLocalizedName(localizationKey, localizationTable),
    classification,
    vesselBoundTags,
    provenance: { source: 'starbreaker-datacore', recordPath: null },
  }
}

/**
 * Assembles full-universe component catalog records from bulk DataCore
 * field-query results. Discovery is driven entirely by `fields.type`
 * (every entity class with an `AttachDef.Type` value) filtered against
 * the reviewed `PLAYER_USABLE_COMPONENT_TYPES` allowlist — never a
 * raw-data fixture, never a hardcoded entity list. Deterministic:
 * iterates entity classes in sorted order.
 */
export function collectBulkComponents(fields: ComponentFieldMaps, localizationTable: Map<string, string>): BulkComponentCollectionResult {
  const records = new Map<string, CatalogRecord>()
  const unresolved: UnresolvedEntry[] = []

  const sortedEntities = Array.from(fields.type.keys()).sort((a, b) => a.localeCompare(b))

  for (const entityClass of sortedEntities) {
    const type = fields.type.get(entityClass)!
    if (!isPlayerUsableComponentType(type)) continue // not in this mission's reviewed category allowlist — not an error, just out of scope

    const record = buildRecordFromBulkFields(entityClass, fields, localizationTable)
    if (record) records.set(entityClass, record)
  }

  return { records, unresolved }
}
