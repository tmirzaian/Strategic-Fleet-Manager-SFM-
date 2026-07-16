/**
 * Operation Golden Fleet — GF-002B manifest builder.
 *
 * Builds a deterministic, one-row-per-canonical-hull manifest from
 * repository sources only — never hand-authored. Must be run via
 * `vite-node` (not plain `tsx`): `selectableShipDefinitions` transitively
 * imports `src/generated/shipCatalog.ts`, which uses `import.meta.glob`
 * (a Vite-only feature plain Node/tsx cannot execute) — confirmed during
 * this mission's own preflight. `vite-node` is already a transitive
 * dependency of this project's existing `vitest` devDependency, so this
 * introduces no new dependency.
 */
import { selectableShipDefinitions, shipFactoryTemplates } from '../../src/data/shipDefinitions'
import { importedShipList } from '../../src/generated/importedShips'
import { shipCatalogRecords, type ShipCatalogRecord } from '../../src/generated/shipCatalog'
import type { ManifestEntry, SourceClass } from './types'

const importedById = new Map(importedShipList.map((v) => [v.ship.id, v]))

function classify(sourceMetadata: { sourceType: string; sourceFile?: string }): SourceClass {
  if (sourceMetadata.sourceType === 'seed') return 'SEED-BACKED'
  if (sourceMetadata.sourceType === 'StarBreaker' && sourceMetadata.sourceFile === 'ship-catalog') return 'CATALOG-ONLY'
  if (sourceMetadata.sourceType === 'StarBreaker' && sourceMetadata.sourceFile === undefined) return 'DEEP-IMPORTED'
  return 'UNCLASSIFIED'
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Candidate "bare hull name" readings of a catalog displayName, for the
 * lenient seed-name matcher below only. `src/data/shipDefinitions.ts`'s
 * own `bareHullName()` requires the definition's own `.manufacturer`
 * field to corroborate the stripped prefix before trusting it (safe,
 * since it drives real canonical dedup across all 258 hulls) — that
 * verification is deliberately NOT reused here, since Mission M-012's
 * catalog `manufacturer.name`/`manufacturer.code` frequently disagree
 * with the abbreviation actually embedded in `displayName` (e.g. MISC's
 * full name is "Musashi Industrial & Starflight Concern", code "MIS",
 * but the displayName prefix is literally "MISC"). Instead this returns
 * every plausible reading (untouched, and with the first word stripped
 * whenever there is more than one word) and lets the caller narrow by
 * exact match against the seed hull's own short, distinctive name — a
 * false strip could only cause a wrong match if some other hull's name
 * coincidentally equaled the same remainder, which `resolveSeedEntityClass`
 * still guards against by requiring exactly one candidate across every
 * catalog record, not just a first hit.
 */
function bareCatalogNameReadings(record: ShipCatalogRecord): string[] {
  const name = record.displayName ?? ''
  const words = name.split(' ')
  const readings = [name]
  if (words.length > 1) readings.push(words.slice(1).join(' ').trim())
  return readings
}

export interface SeedResolution {
  matched: ShipCatalogRecord | null
  candidates: ShipCatalogRecord[]
}

/**
 * Resolves a seed-backed hull's real StarBreaker entity class by matching
 * its own hand-authored display name against the 294-record ship catalog
 * (manufacturer-prefix optionally stripped, case/punctuation-insensitive).
 * Reports ambiguity explicitly (>1 candidate) rather than guessing — a
 * seed hull with 0 or >1 matches is never silently assigned an entity id.
 */
export function resolveSeedEntityClass(seedDisplayName: string): SeedResolution {
  const target = normalizeForMatch(seedDisplayName)
  const candidates = shipCatalogRecords.filter((r) => bareCatalogNameReadings(r).some((reading) => normalizeForMatch(reading) === target))
  return { matched: candidates.length === 1 ? candidates[0] : null, candidates }
}

export function buildManifest(): ManifestEntry[] {
  return selectableShipDefinitions.map((d) => {
    const sourceClass = classify(d.sourceMetadata)
    const importedView = importedById.get(d.id)
    const sourceEntityClass = importedView?.ship.sourceEntityClass

    let requestedEntityId = ''
    let requestedEntityIdSource: ManifestEntry['requestedEntityIdSource'] = 'unresolved'
    let matchedCatalogEntityClass: string | null = null
    let matchedCatalogDisplayName: string | null = null
    let alternateCandidates: ManifestEntry['alternateCandidates'] = []
    let aliasNotes: string | null = null

    if (sourceClass === 'DEEP-IMPORTED' && sourceEntityClass) {
      requestedEntityId = sourceEntityClass
      requestedEntityIdSource = 'sourceEntityClass'
      matchedCatalogEntityClass = sourceEntityClass
      const catalogRec = shipCatalogRecords.find((r) => r.entityClass === sourceEntityClass)
      matchedCatalogDisplayName = catalogRec?.displayName ?? null
    } else if (sourceClass === 'CATALOG-ONLY') {
      // catalogDefinitions in shipDefinitions.ts sets id: r.entityClass verbatim.
      requestedEntityId = d.id
      requestedEntityIdSource = 'catalogEntityClassId'
      matchedCatalogEntityClass = d.id
      const catalogRec = shipCatalogRecords.find((r) => r.entityClass === d.id)
      matchedCatalogDisplayName = catalogRec?.displayName ?? null
    } else if (sourceClass === 'SEED-BACKED') {
      const { matched, candidates } = resolveSeedEntityClass(d.displayName)
      if (matched) {
        requestedEntityId = matched.entityClass
        requestedEntityIdSource = 'seedNameMatch'
        matchedCatalogEntityClass = matched.entityClass
        matchedCatalogDisplayName = matched.displayName
        aliasNotes = `Seed hull "${d.displayName}" matched to catalog entity "${matched.entityClass}" by manufacturer-stripped display-name match (no prior sourceEntityClass on this seed definition).`
      } else {
        alternateCandidates = candidates.map((c) => ({ entityClass: c.entityClass, displayName: c.displayName }))
        aliasNotes =
          candidates.length === 0
            ? `Seed hull "${d.displayName}" has no matching catalog entity by display name — cannot resolve an entity id automatically.`
            : `Seed hull "${d.displayName}" matched ${candidates.length} catalog entities ambiguously — cannot pick one automatically.`
      }
    }

    const expectedOutputFilename = requestedEntityId ? `${requestedEntityId}.json` : `UNRESOLVED_${d.id}.json`

    // The 6 approved raw-data files are named "<MFG_CODE> <Ship Name>.json"
    // and are keyed by entity class in generated-data/ships.json's own
    // sourceEntityClass field — a hull already covered there needs no
    // further acquisition.
    const alreadyInRawData = sourceClass === 'DEEP-IMPORTED'

    const template = shipFactoryTemplates[d.id] ?? []

    return {
      displayName: d.displayName,
      manufacturer: d.manufacturer,
      canonicalId: d.id,
      sourceClass,
      requestedEntityId,
      requestedEntityIdSource,
      matchedCatalogEntityClass,
      matchedCatalogDisplayName,
      alternateCandidates,
      aliasNotes,
      expectedOutputFilename,
      alreadyInRawData,
      acquisitionStatus: alreadyInRawData ? 'ALREADY_VALIDATED' : requestedEntityId ? 'PENDING' : 'NO_MECHANICAL_ENTITY',
      failureReason: !requestedEntityId ? (aliasNotes ?? 'No exportable entity identifier resolved.') : null,
      // Not part of ManifestEntry's own persisted shape, but useful for the
      // acquisition runner to skip a hull whose current template already
      // has real mechanical data (e.g. the 6 deep-imported hulls) without
      // recomputing sourceClass logic a second time.
      __currentPortCount: template.length,
    } as ManifestEntry & { __currentPortCount: number }
  })
}
