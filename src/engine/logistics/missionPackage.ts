import type { Hardpoint, InstalledLoadoutEntry, MissionReservation, HangarItem, MissionPackageResult, MissionPackageState } from '../../types'
import { calculateComponentAvailability } from './availability'

/**
 * The Mission Package engine (Alpha 2.3, Part 6-8) — derived, never a
 * disconnected duplicate target list. Computed fresh from the Mission
 * Configuration's own Hardpoint rows (target intent + Installed Match,
 * shared with the Alpha 2.0/2.1 Build Progress engine's status logic),
 * the shared Installed Loadout, and current reservations.
 *
 * Deliberately keeps TWO separate percentages (Part 7), because they
 * answer two different questions:
 *   - installedPercentage: "Is this Fleet Asset physically configured for
 *     the Mission right now?" — only exact Installed matches count.
 *   - packagePercentage: "Does the player own and commit everything
 *     required?" — Installed OR Reserved counts; merely AVAILABLE
 *     (unreserved) inventory does NOT, because nothing has committed it
 *     yet — it could still be reserved for something else tomorrow.
 *
 * `isFactoryBuild` short-circuits straight to FACTORY_LOADOUT — a
 * Factory-only Fleet Asset never gets a Mission Package at all.
 */
export function calculateMissionPackage(
  buildId: string,
  hardpoints: Hardpoint[],
  installedLoadouts: InstalledLoadoutEntry[],
  reservations: MissionReservation[],
  hangarItems: HangarItem[],
  isFactoryBuild: boolean = false
): MissionPackageResult {
  if (isFactoryBuild) {
    return {
      missionConfigurationId: buildId,
      totalRequiredAssignments: 0,
      installedMatches: 0,
      reservedMatches: 0,
      availableUnreservedMatches: 0,
      missingAssignments: [],
      invalidAssignments: [],
      installedPercentage: 100,
      packagePercentage: 100,
      packageState: 'FACTORY_LOADOUT',
      isMissionReady: false,
      isPackageStaged: false,
    }
  }

  const rows = hardpoints.filter((h) => h.buildId === buildId)
  // Unresolved factory data is never a required assignment — same rule
  // the Build Progress engine uses (Alpha 2.1, Part 12).
  const required = rows.filter((h) => h.targetItem && h.targetItem !== '—' && h.status !== 'Unresolved')

  let installedMatches = 0
  let reservedMatches = 0
  let availableUnreservedMatches = 0
  const missingAssignments: string[] = []
  const invalidAssignments: string[] = []

  for (const row of required) {
    if (row.status === 'Invalid Target') {
      invalidAssignments.push(row.targetItem)
      continue
    }
    if (row.status === 'OK') {
      installedMatches += 1
      continue
    }
    const activeReservation = reservations.find(
      (r) => r.missionConfigurationId === buildId && r.targetSlotLabel === row.slotLabel && r.componentName === row.targetItem && r.status === 'ACTIVE'
    )
    if (activeReservation) {
      reservedMatches += 1
      continue
    }
    const availability = calculateComponentAvailability(row.targetItem, hangarItems, installedLoadouts, reservations, row.targetEntityClass)
    if (availability.availableQuantity > 0) {
      // Owned, but not yet committed — shown to the player as an Action
      // Opportunity, but it never counts toward Package Readiness on its
      // own (Part 7: "does not count merely available unreserved
      // inventory as committed package readiness").
      availableUnreservedMatches += 1
      continue
    }
    missingAssignments.push(row.targetItem)
  }

  const totalRequiredAssignments = required.length
  const installedPercentage = totalRequiredAssignments > 0 ? Math.round((installedMatches / totalRequiredAssignments) * 100) : 100
  const packagePercentage = totalRequiredAssignments > 0 ? Math.round(((installedMatches + reservedMatches) / totalRequiredAssignments) * 100) : 100

  const hasInvalid = invalidAssignments.length > 0
  const isMissionReady = !hasInvalid && installedMatches === totalRequiredAssignments
  const isPackageStaged = !hasInvalid && installedMatches + reservedMatches === totalRequiredAssignments

  let packageState: MissionPackageState
  if (hasInvalid) packageState = 'INVALID'
  else if (isMissionReady) packageState = 'MISSION_READY'
  else if (isPackageStaged) packageState = 'PACKAGE_STAGED'
  else if (installedMatches + reservedMatches > 0) packageState = 'COLLECTING_PARTS'
  else packageState = 'PLANNING'

  return {
    missionConfigurationId: buildId,
    totalRequiredAssignments,
    installedMatches,
    reservedMatches,
    availableUnreservedMatches,
    missingAssignments,
    invalidAssignments,
    installedPercentage,
    packagePercentage,
    packageState,
    isMissionReady,
    isPackageStaged,
  }
}
