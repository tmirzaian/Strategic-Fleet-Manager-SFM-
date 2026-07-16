/// <reference types="vite/client" />
/**
 * Browser-side loader for generated-data/ship-catalog.json (Mission M-012).
 *
 * This file is gitignored (see .gitignore's licensing-posture note,
 * ADR-005) — a fresh clone that hasn't run `npm run generate:ship-catalog`
 * locally simply doesn't have it. A plain static `import` would fail the
 * Vite build in that case; `import.meta.glob` instead resolves to an
 * empty match, which is treated the same way
 * `componentMetadataResolver.ts` already treats a missing catalog on the
 * Node side: a normal, expected "not generated yet" state, not an error.
 * Add Ship then simply falls back to the existing seed + imported roster.
 */
const modules = import.meta.glob<{ default: unknown }>('../../generated-data/ship-catalog.json', { eager: true })
const rawCatalog = Object.values(modules)[0]?.default as ShipCatalogFile | undefined

export interface ShipCatalogManufacturer {
  code: string
  name: string | null
  localizationKey: string | null
}

export interface ShipCatalogRecord {
  entityClass: string
  category: 'ship' | 'ground_vehicle'
  movementClass: string
  manufacturer: ShipCatalogManufacturer | null
  displayName: string | null
  careerKey: string | null
  roleKey: string | null
  careerName: string | null
  roleName: string | null
  crewSize: number | null
  dimensions: { x: number; y: number; z: number } | null
}

interface ShipCatalogFile {
  schemaVersion: number
  records: Record<string, ShipCatalogRecord>
}

/** Every catalog record with a resolved display name — Add Ship can't usefully search/show an entry with no name. */
export const shipCatalogRecords: ShipCatalogRecord[] = rawCatalog ? Object.values(rawCatalog.records).filter((r) => r.displayName) : []

export const hasShipCatalog = shipCatalogRecords.length > 0
