import { classifyMovementClass, isNonPlayerVariantName } from './playerVehicleTaxonomy'
import { parseManufacturerReference } from '../universeCatalog/manufacturerResolver'
import { resolveLocalizedName } from '../universeCatalog/localization'
import { parseBulkJson, parseBulkNumber } from '../universeCatalog/dcbBulkQuery'
import { SHIP_CATALOG_GENERATOR_NAME, SHIP_CATALOG_GENERATOR_VERSION, SHIP_CATALOG_SCHEMA_VERSION } from './shipCatalogSchema'
import type { ShipCatalogFile, ShipCatalogRecord, ShipCatalogSource, ShipCatalogUnresolvedEntry } from './shipCatalogSchema'

export interface ShipCatalogFieldMaps {
  movementClass: Map<string, string>
  manufacturerCode: Map<string, string>
  manufacturerLocKey: Map<string, string>
  vehicleName: Map<string, string>
  vehicleCareer: Map<string, string>
  vehicleRole: Map<string, string>
  crewSize: Map<string, string>
  maxBoundingBoxSize: Map<string, string>
}

interface Vec3Raw {
  x?: number
  y?: number
  z?: number
}

/**
 * Assembles the full ship catalog document from bulk field-query results.
 * Deterministic: iterates `movementClass` keys (the vehicle-discovery
 * query) in sorted order, so re-running the generator against the same
 * DataCore state and the same bulk-query results always produces
 * byte-identical output (aside from `generatedAt`).
 */
export function buildShipCatalog(fields: ShipCatalogFieldMaps, localizationTable: Map<string, string>, source: ShipCatalogSource): ShipCatalogFile {
  const totalCandidates = fields.movementClass.size
  const records: Record<string, ShipCatalogRecord> = {}
  const unresolved: ShipCatalogUnresolvedEntry[] = []
  let excludedNonPlayerVariantCount = 0

  const sortedEntities = Array.from(fields.movementClass.keys()).sort((a, b) => a.localeCompare(b))

  for (const entityClass of sortedEntities) {
    const movementClass = fields.movementClass.get(entityClass)!
    const category = classifyMovementClass(movementClass)

    if (!category) {
      unresolved.push({ entityClass, reason: `movementClass "${movementClass}" is not a player-operable ship/ground-vehicle class.` })
      continue
    }

    if (isNonPlayerVariantName(entityClass)) {
      excludedNonPlayerVariantCount++
      continue
    }

    const manufacturerRef = parseManufacturerReference(fields.manufacturerCode.get(entityClass), fields.manufacturerLocKey.get(entityClass))
    const vehicleNameKey = fields.vehicleName.get(entityClass) ?? null
    const careerKey = fields.vehicleCareer.get(entityClass) ?? null
    const roleKey = fields.vehicleRole.get(entityClass) ?? null
    const crewSize = parseBulkNumber(fields.crewSize.get(entityClass))
    const dimensionsRaw = parseBulkJson<Vec3Raw>(fields.maxBoundingBoxSize.get(entityClass))
    const dimensions =
      dimensionsRaw && typeof dimensionsRaw.x === 'number' && typeof dimensionsRaw.y === 'number' && typeof dimensionsRaw.z === 'number'
        ? { x: dimensionsRaw.x, y: dimensionsRaw.y, z: dimensionsRaw.z }
        : null

    records[entityClass] = {
      entityClass,
      recordName: `EntityClassDefinition.${entityClass}`,
      category,
      movementClass,
      manufacturer: manufacturerRef
        ? {
            code: manufacturerRef.code,
            name: resolveLocalizedName(manufacturerRef.localizationKey, localizationTable),
            localizationKey: manufacturerRef.localizationKey,
          }
        : null,
      displayName: resolveLocalizedName(vehicleNameKey, localizationTable),
      localizationKey: vehicleNameKey,
      careerKey,
      roleKey,
      careerName: resolveLocalizedName(careerKey, localizationTable),
      roleName: resolveLocalizedName(roleKey, localizationTable),
      crewSize,
      dimensions,
      provenance: { source: 'starbreaker-datacore', recordPath: null },
    }
  }

  return {
    schemaVersion: SHIP_CATALOG_SCHEMA_VERSION,
    generator: { name: SHIP_CATALOG_GENERATOR_NAME, version: SHIP_CATALOG_GENERATOR_VERSION },
    source,
    totalCandidates,
    excludedNonPlayerVariantCount,
    records,
    unresolved: unresolved.sort((a, b) => a.entityClass.localeCompare(b.entityClass)),
  }
}
