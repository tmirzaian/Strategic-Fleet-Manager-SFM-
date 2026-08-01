import type { Ship, Build, Hardpoint, HangarItem, FleetAsset, SeedAssetOverride, InstalledLoadoutEntry, MissionReservation, QuarantinedAssignment } from '../types'

/**
 * EWO-093 — "Fleet Export Architecture." The exact payload
 * `useFleetStore.ts`'s `persist()` middleware already writes to
 * `localStorage` on every state change (see that file's own `partialize`,
 * which now calls `buildFleetPersistencePayload` below instead of
 * carrying its own inline object literal) — a Commander's "fleet," for
 * portability purposes, is precisely what already survives a browser
 * refresh, never a second, richer, or narrower concept. See
 * `docs/Beta-2.1-Fleet-Export-Architecture.md` for the full reasoning.
 */
export interface FleetPersistencePayload {
  fleetAssets: FleetAsset[]
  hangarItems: HangarItem[]
  reservations: MissionReservation[]
  installedLoadouts: InstalledLoadoutEntry[]
  seedAssetOverrides: Record<string, SeedAssetOverride>
  customBuilds: Build[]
  customBuildHardpoints: Hardpoint[]
  activeBuildByShipId: Record<string, string>
  quarantinedAssignments: QuarantinedAssignment[]
  seedFleetLegacyInstall: boolean
}

/** The narrow slice of live store state `buildFleetPersistencePayload`
 * actually reads — deliberately not `useFleetStore.ts`'s own (unexported)
 * `FleetState`, so this module has zero dependency on the store and stays
 * independently testable/reusable (a real `FleetState` object satisfies
 * this structurally, with no cast needed at the call site). */
export interface FleetPersistenceSource {
  ships: Ship[]
  builds: Build[]
  hardpoints: Hardpoint[]
  fleetAssets: FleetAsset[]
  hangarItems: HangarItem[]
  reservations: MissionReservation[]
  installedLoadouts: InstalledLoadoutEntry[]
  seedAssetOverrides: Record<string, SeedAssetOverride>
  quarantinedAssignments: QuarantinedAssignment[]
  seedFleetLegacyInstall: boolean
}

/**
 * Field-selection logic migrated verbatim out of `useFleetStore.ts`'s own
 * `partialize` — same filters, same exclusions (factory Builds/Hardpoints,
 * derived caches, `ships`, `log`, `shipDefinitions` are never included;
 * they are always regenerated fresh from seed + catalog + materialization,
 * never trusted as a source of truth). Called by BOTH `partialize` (the
 * browser's own local save) and Fleet Export — one implementation, so the
 * two can never drift apart.
 */
export function buildFleetPersistencePayload(source: FleetPersistenceSource): FleetPersistencePayload {
  return {
    // SW-015C — a retired manual asset persists in full; only the
    // seed-migration exclusion (handled separately via seedAssetOverrides)
    // is filtered out here.
    fleetAssets: source.fleetAssets.filter((a) => a.acquisitionSource !== 'SEED_MIGRATION'),
    hangarItems: source.hangarItems,
    reservations: source.reservations,
    installedLoadouts: source.installedLoadouts,
    seedAssetOverrides: source.seedAssetOverrides,
    // EWO-027 — factory Builds are always deterministically regenerated;
    // persisting them would only be redundant bytes.
    customBuilds: source.builds.filter((b) => b.kind !== 'FACTORY'),
    customBuildHardpoints: source.hardpoints.filter((h) => source.builds.some((b) => b.id === h.buildId && b.kind !== 'FACTORY')),
    activeBuildByShipId: Object.fromEntries(source.ships.map((s) => [s.id, s.activeBuildId])),
    quarantinedAssignments: source.quarantinedAssignments,
    seedFleetLegacyInstall: source.seedFleetLegacyInstall,
  }
}

/**
 * The portable file format. `schemaVersion` is deliberately
 * `PERSIST_VERSION` itself, not an independent counter — see
 * `docs/Beta-2.1-Fleet-Export-Architecture.md` §3. `appVersion` is
 * informational provenance only (never a compatibility gate).
 */
export interface FleetExportEnvelope {
  schemaVersion: number
  appVersion: string
  exportedAt: string
  payload: FleetPersistencePayload
}

export function buildFleetExportEnvelope(payload: FleetPersistencePayload, schemaVersion: number, appVersion: string, now: Date = new Date()): FleetExportEnvelope {
  return { schemaVersion, appVersion, exportedAt: now.toISOString(), payload }
}

/** Pretty-printed — an exported fleet file is something a Commander may
 * reasonably open and read, not only round-trip through a future Import. */
export function serializeFleetExportEnvelope(envelope: FleetExportEnvelope): string {
  return JSON.stringify(envelope, null, 2)
}

/** e.g. "sfm-fleet-export-2026-07-31.json" — derived from the envelope's
 * own `exportedAt` so the filename always matches the file's contents. */
export function suggestFleetExportFilename(envelope: Pick<FleetExportEnvelope, 'exportedAt'>): string {
  const datePart = envelope.exportedAt.slice(0, 10)
  return `sfm-fleet-export-${datePart}.json`
}
