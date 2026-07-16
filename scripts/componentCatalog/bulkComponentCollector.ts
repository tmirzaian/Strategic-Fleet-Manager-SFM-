import { isPlayerUsableComponentType } from './componentTaxonomy'
import { parseManufacturerReference } from '../universeCatalog/manufacturerResolver'
import { resolveLocalizedName } from '../universeCatalog/localization'
import { parseBulkNumber } from '../universeCatalog/dcbBulkQuery'
import type { CatalogRecord, UnresolvedEntry } from './catalogSchema'

export interface ComponentFieldMaps {
  type: Map<string, string>
  subType: Map<string, string>
  size: Map<string, string>
  grade: Map<string, string>
  manufacturerCode: Map<string, string>
  manufacturerLocKey: Map<string, string>
  localizationName: Map<string, string>
}

export interface BulkComponentCollectionResult {
  records: Map<string, CatalogRecord>
  unresolved: UnresolvedEntry[]
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

    const subtype = fields.subType.get(entityClass) ?? null
    const size = parseBulkNumber(fields.size.get(entityClass))
    const grade = parseBulkNumber(fields.grade.get(entityClass))
    const manufacturerRef = parseManufacturerReference(fields.manufacturerCode.get(entityClass), fields.manufacturerLocKey.get(entityClass))
    const localizationKey = fields.localizationName.get(entityClass) ?? null

    records.set(entityClass, {
      entityClass,
      recordName: `EntityClassDefinition.${entityClass}`,
      category: type,
      subtype: subtype && subtype !== 'UNDEFINED' ? subtype : null,
      size,
      grade,
      manufacturerRef: manufacturerRef?.code ?? null,
      localizationKey,
      displayName: resolveLocalizedName(localizationKey, localizationTable),
      provenance: { source: 'starbreaker-datacore', recordPath: null },
    })
  }

  return { records, unresolved }
}
