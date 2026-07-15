import type { FleetAsset, ShipDefinition } from '../types'
import { shipDefinitionById } from '../data/shipDefinitions'
import { importedShipList } from '../generated/importedShips'
import { shipCatalogRecords } from '../generated/shipCatalog'
import { resolveShipDefinitionId } from './loadoutEditorModel'

// EWO-033 (Task 6) — a deep-imported ShipDefinition's own id is always the
// imported ship's own record id (e.g. "eclipse-imported"), never its raw
// entity class, regardless of which alias key was used to look it up via
// shipDefinitionById (see shipDefinitions.ts's aliasing — both the record
// id and the entity class resolve to the SAME object, whose own `.id` is
// always the record id). This map recovers the entity class from that id
// so a deep-imported definition's real hull can be cross-referenced
// against the separate Mission M-012 catalog dataset.
const entityClassByImportedShipId = new Map(
  importedShipList.map((v) => [v.ship.id, v.ship.sourceEntityClass]).filter((entry): entry is [string, string] => Boolean(entry[1]))
)

// EWO-033 (Task 6) — Mission M-012's full-universe catalog, keyed by raw
// entity class (e.g. "AEGS_Eclipse"), used only as the Task 7 precedence
// tier-2 fallback below.
const catalogRoleByEntityClass = new Map(
  shipCatalogRecords.map((r) => [r.entityClass, (r.roleName ?? r.roleKey ?? '').trim() || undefined])
)

/** A definition's own role/career string is treated as real data only when
 * non-blank and not the catalog-only placeholder 'Unknown' (used when even
 * Mission M-012 itself has no roleName/roleKey for that record) — Ruling 13
 * requires missing authoritative metadata to degrade honestly, not display
 * a literal "Unknown" as if it were a real value. */
function realValue(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed !== 'Unknown' ? trimmed : undefined
}

/**
 * EWO-033 (Task 7) — the one resolver for a Fleet Asset's stock role/focus
 * text, in the approved precedence order:
 *
 *   1. The ship's own canonical ShipDefinition.role, when genuinely
 *      populated — true for every seed ship (hand-authored, reviewed) and
 *      every catalog-only ship (Mission M-012 data baked directly into the
 *      definition at construction), and true for a deep-imported ship
 *      whenever its raw StarBreaker export happened to carry the legacy
 *      `entity.role` field.
 *   2. When the canonical definition is deep-imported but its own role
 *      came back empty (StarBreaker's metadata-less `root` export
 *      envelope — a real, honest upstream gap, not a wiring bug — see
 *      docs/ImportPipeline.md), fall back to Mission M-012's own catalog
 *      record for that exact real hull (cross-referenced by entity class),
 *      which frequently has the same real hull's role text under a
 *      different, non-canonical definition id.
 *   3. No role/focus text — never invented from the ship's name (Ruling
 *      11), never substituted from a Build's role/category or the
 *      Commander's future user-defined Fleet Profile role (Ruling 10).
 *
 * Deliberately independent of `Ship.role` (the materialized Fleet Asset
 * field) — that field mirrors whatever Build was active at materialization
 * time (see its own doc comment in src/types/index.ts) and, for a
 * nicknamed asset, can even embed the ship's display name a second time
 * (`fleetAssetMaterializer.ts`'s `resolvedNickname` branch) — neither is
 * stock metadata, and resolving from the definition directly avoids both.
 */
export function resolveShipStockRoleFocus(shipId: string, fleetAssets: FleetAsset[]): string | undefined {
  const definitionId = resolveShipDefinitionId(shipId, fleetAssets)
  if (!definitionId) return undefined
  const definition = shipDefinitionById.get(definitionId)
  if (!definition) return undefined
  return resolveStockRoleFocusForDefinition(definition)
}

/**
 * The same tier-1/tier-2 precedence as `resolveShipStockRoleFocus`, but
 * keyed directly off a `ShipDefinition` rather than a live Fleet Asset —
 * used by the Task 9 metadata-coverage audit to check every canonical
 * hull definition (`selectableShipDefinitions`) without needing to
 * materialize a Fleet Asset for each one.
 */
export function resolveStockRoleFocusForDefinition(definition: ShipDefinition): string | undefined {
  const ownRole = realValue(definition.role)
  if (ownRole) return ownRole

  const entityClass = entityClassByImportedShipId.get(definition.id)
  if (entityClass) {
    const catalogRole = catalogRoleByEntityClass.get(entityClass)
    if (catalogRole) return catalogRole
  }

  return undefined
}

/**
 * EWO-033 (Task 8) — the one normalization path for the secondary identity
 * line every ShipCard consumer renders: "Manufacturer · Stock Role/Focus",
 * or manufacturer alone when no stock role/focus resolved — never a
 * dangling separator, never a doubled/duplicate manufacturer prefix (this
 * never touches `Ship.role`, so the nickname-doubling case above can't
 * reach here at all).
 */
export function formatShipIdentityLine(manufacturer: string, stockRoleFocus: string | undefined): string {
  const trimmedManufacturer = manufacturer.trim()
  const trimmedRole = stockRoleFocus?.trim()
  return trimmedRole ? `${trimmedManufacturer} · ${trimmedRole}` : trimmedManufacturer
}
