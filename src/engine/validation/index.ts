import type { Ship, Build, Hardpoint, FleetAsset, ShipDefinition, ValidationIssue } from '../../types'
import { UNKNOWN_FACTORY_PLACEHOLDER } from '../../utils/hardpointStatus'

/**
 * Central domain-validation layer (Alpha 2.1, Part 2). Every function
 * here returns structured `ValidationIssue[]` — never throws, never
 * crashes the app because demo/test data is incomplete. Invalid data
 * must be *visible* to developers (see the diagnostics panel on
 * Captain's Log) without ever silently masquerading as valid
 * readiness/procurement data elsewhere in the app.
 */

/** activeBuildId must reference a real Build record (Part 14, test 22). */
export function validateActiveBuildReference(ships: Ship[], builds: Build[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const buildIds = new Set(builds.map((b) => b.id))
  for (const ship of ships) {
    if (!buildIds.has(ship.activeBuildId)) {
      issues.push({
        severity: 'ERROR',
        code: 'MISSING_ACTIVE_BUILD',
        entityType: 'Ship',
        entityId: ship.id,
        message: `"${ship.name}" has activeBuildId "${ship.activeBuildId}" which does not reference any real Build record.`,
        relatedIds: [ship.activeBuildId],
        suggestedAction: 'Assign a valid Build or repair the reference.',
      })
    }
  }
  return issues
}

/** Every Build must belong to a Fleet Asset that actually exists (Part 2). */
export function validateBuild(builds: Build[], ships: Ship[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const shipIds = new Set(ships.map((s) => s.id))
  for (const build of builds) {
    if (!shipIds.has(build.shipId)) {
      issues.push({
        severity: 'ERROR',
        code: 'ORPHANED_BUILD',
        entityType: 'Build',
        entityId: build.id,
        message: `Build "${build.name}" references shipId "${build.shipId}", which has no matching Fleet Asset.`,
        relatedIds: [build.shipId],
        suggestedAction: 'Remove the orphaned Build or repair its shipId reference.',
      })
    }
  }
  return issues
}

/** Every hardpoint/assignment must belong to a Build that actually exists (Part 2, orphaned loadouts). */
export function validateBuildAssignment(hardpoints: Hardpoint[], builds: Build[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const buildIds = new Set(builds.map((b) => b.id))
  const seenOrphanedBuildIds = new Set<string>()
  for (const hp of hardpoints) {
    if (!buildIds.has(hp.buildId) && !seenOrphanedBuildIds.has(hp.buildId)) {
      seenOrphanedBuildIds.add(hp.buildId)
      issues.push({
        severity: 'ERROR',
        code: 'ORPHANED_LOADOUT',
        entityType: 'Hardpoint',
        entityId: hp.id,
        message: `One or more hardpoint assignments reference buildId "${hp.buildId}", which has no matching Build record.`,
        relatedIds: [hp.buildId],
        suggestedAction: 'Create the missing Build record or remove the orphaned assignments.',
      })
    }
  }
  return issues
}

/** A Fleet Asset must reference a Ship Definition that actually exists (Part 2). */
export function validateFleetAsset(fleetAssets: FleetAsset[], shipDefinitions: ShipDefinition[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const defIds = new Set(shipDefinitions.map((d) => d.id))
  for (const asset of fleetAssets) {
    // SW-015C — a retired vessel is a fully preserved, recommissionable
    // record now, not a gone-forever tombstone (the old model's
    // 'removed'), so a broken ship-definition reference is just as much
    // a real data-integrity issue for it as for an active vessel.
    if (!defIds.has(asset.shipDefinitionId)) {
      issues.push({
        severity: 'ERROR',
        code: 'MISSING_SHIP_DEFINITION',
        entityType: 'FleetAsset',
        entityId: asset.id,
        message: `Fleet Asset "${asset.id}" references shipDefinitionId "${asset.shipDefinitionId}", which no longer exists.`,
        relatedIds: [asset.shipDefinitionId],
        suggestedAction: 'Preserve the Fleet Asset and flag it for review rather than deleting it.',
      })
    }
  }
  return issues
}

/** Flags hardpoints whose target is incompatible with the port (Part 2, Golden Scenario A). */
export function validateFactoryLoadout(hardpoints: Hardpoint[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const hp of hardpoints) {
    if (hp.status === 'Invalid Target') {
      issues.push({
        severity: 'ERROR',
        code: 'INCOMPATIBLE_TARGET',
        entityType: 'Hardpoint',
        entityId: hp.id,
        message: hp.invalidMessage ?? `"${hp.targetItem}" targeted at ${hp.slotLabel} is not compatible with this port.`,
        relatedIds: [hp.buildId],
        suggestedAction: 'Correct the Target assignment or the port size/type data.',
      })
    }
  }
  return issues
}

/** Flags unresolved factory data — the "Unknown Factory Item" placeholder (Part 12, Golden Scenario H). */
export function validateInstalledLoadout(hardpoints: Hardpoint[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const hp of hardpoints) {
    if (hp.factoryItem === UNKNOWN_FACTORY_PLACEHOLDER) {
      issues.push({
        severity: 'WARNING',
        code: 'UNRESOLVED_FACTORY_DATA',
        entityType: 'Hardpoint',
        entityId: hp.id,
        message: `${hp.slotLabel} has no resolved factory component — excluded from exact Build Progress matching.`,
        relatedIds: [hp.buildId],
        suggestedAction: 'Run the importer against real source data for this slot, or supply a manual override.',
      })
    }
  }
  return issues
}

/**
 * Mirrors buildProcurementList's own exclusion rules, but as visible
 * ValidationIssue records instead of silent filtering (Part 3) — this is
 * what a developer-only Invalid Data panel reads from.
 */
export function validateProcurementEntry(hardpoints: Hardpoint[], builds: Build[], ships: Ship[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const buildById = new Map(builds.map((b) => [b.id, b]))
  const shipIds = new Set(ships.map((s) => s.id))

  for (const hp of hardpoints) {
    if (hp.status === 'OK' || hp.status === 'Unresolved') continue
    if (!hp.targetItem || hp.targetItem === '—') continue

    if (hp.status === 'Invalid Target') {
      issues.push({
        severity: 'WARNING',
        code: 'PROCUREMENT_INVALID_TARGET',
        entityType: 'Hardpoint',
        entityId: hp.id,
        message: `"${hp.targetItem}" excluded from Procurement List — incompatible target, not a real recommendation.`,
        relatedIds: [hp.buildId],
      })
      continue
    }
    const build = buildById.get(hp.buildId)
    if (!build) {
      issues.push({
        severity: 'WARNING',
        code: 'PROCUREMENT_MISSING_BUILD',
        entityType: 'Hardpoint',
        entityId: hp.id,
        message: `A procurement candidate references a Build that doesn't exist — excluded.`,
        relatedIds: [hp.buildId],
      })
      continue
    }
    if (!shipIds.has(build.shipId)) {
      issues.push({
        severity: 'WARNING',
        code: 'PROCUREMENT_MISSING_FLEET_ASSET',
        entityType: 'Hardpoint',
        entityId: hp.id,
        message: `A procurement candidate's Build has no matching Fleet Asset — excluded.`,
        relatedIds: [build.shipId],
      })
    }
  }
  return issues
}

/** Detects duplicate ids across a Fleet Asset/Build/Hardpoint dataset (Part 2). */
export function validateCatalogIntegrity(ships: Ship[], builds: Build[], hardpoints: Hardpoint[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  function findDuplicates(ids: string[], entityType: string) {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) {
        issues.push({ severity: 'ERROR', code: 'DUPLICATE_ID', entityType, entityId: id, message: `Duplicate ${entityType} id "${id}" found more than once.` })
      }
      seen.add(id)
    }
  }
  findDuplicates(ships.map((s) => s.id), 'Ship')
  findDuplicates(builds.map((b) => b.id), 'Build')
  findDuplicates(hardpoints.map((h) => h.id), 'Hardpoint')
  return issues
}

export interface ValidationSummary {
  issues: ValidationIssue[]
  errorCount: number
  warningCount: number
  infoCount: number
}

/**
 * Runs every validator against the current store snapshot and returns one
 * combined, structured, queryable result (Part 24's diagnostics panel
 * reads directly from this).
 */
export function runFullValidation(data: {
  ships: Ship[]
  builds: Build[]
  hardpoints: Hardpoint[]
  fleetAssets: FleetAsset[]
  shipDefinitions: ShipDefinition[]
}): ValidationSummary {
  const issues = [
    ...validateActiveBuildReference(data.ships, data.builds),
    ...validateBuild(data.builds, data.ships),
    ...validateBuildAssignment(data.hardpoints, data.builds),
    ...validateFleetAsset(data.fleetAssets, data.shipDefinitions),
    ...validateFactoryLoadout(data.hardpoints),
    ...validateInstalledLoadout(data.hardpoints),
    ...validateProcurementEntry(data.hardpoints, data.builds, data.ships),
    ...validateCatalogIntegrity(data.ships, data.builds, data.hardpoints),
  ]
  return {
    issues,
    errorCount: issues.filter((i) => i.severity === 'ERROR').length,
    warningCount: issues.filter((i) => i.severity === 'WARNING').length,
    infoCount: issues.filter((i) => i.severity === 'INFO').length,
  }
}
