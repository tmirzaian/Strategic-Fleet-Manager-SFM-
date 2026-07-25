import type { Build, HangarItem, InstalledLoadoutEntry, MissionReservation, Ship } from '../types'
import type { TargetComponentOption } from '../components/TargetComponentPicker'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { findActiveSlotReservation } from '../engine/logistics/reservationLookup'
import { identitiesMatch, type ResolvedComponentIdentity } from '../engine/installation/componentIdentityService'

/**
 * SW-014A — Inline Installed Component Workflow.
 *
 * Buckets an already-computed, already-compatibility-filtered candidate
 * list (the SAME `TargetComponentOption[]` `newTargetOptionsFor()` already
 * produces for the Manage Loadout picker — no second compatibility
 * authority) into the acquisition tiers `describeAcquisitionHint` already
 * names, but for EVERY compatible candidate at once rather than just the
 * current target. This is read/presentation-only: every actual mutation
 * still goes through the existing `installComponent`/`removeComponent`
 * store actions (the one shared installation engine) — this module never
 * touches inventory, reservations, or hardpoints itself.
 */

function identityFor(item: string, entityClass?: string): ResolvedComponentIdentity {
  return { displayName: item, entityClass: entityClass ?? null, category: null, size: null }
}

export interface OwnedInstallCandidate {
  item: string
  entityClass?: string
  label: string
  /** Immediately installable quantity — either genuinely free stock, or a
   * unit already reserved for this exact port (installing it just
   * fulfills that reservation, per `installComponent`'s own behavior). */
  quantity: number
  /** True when this candidate's own availability comes from a reservation
   * already committed to this exact port (Tier 1's "no further action
   * needed" case, per `describeAcquisitionHint`) rather than genuinely
   * free Hangar stock. */
  reservedForThisPort: boolean
  /** SW-014A — the specific real HangarItem row to consume, when one
   * exists. Installing by `hangarItemId` (via the store's own `moveToShip`)
   * rather than by display name alone (`installComponent`) is required for
   * correct inventory bookkeeping here: `installComponent`'s own
   * `planHangarDecrement` only decrements Hangar stock when a matching
   * ACTIVE reservation exists for this exact port — its own "no
   * reservation, no hangarItemId" branch is a deliberate no-inventory-
   * bookkeeping no-op (EWO-029, the free-text Quick Update case, which
   * never references a specific owned row). Undefined only when no real
   * HangarItem row backs this candidate at all. */
  hangarItemId?: string
}

export interface BlockingReservation {
  id: string
  shipName: string
  buildName: string
  slotLabel: string
}

export interface ReservedInstallCandidate {
  item: string
  entityClass?: string
  label: string
  blockingReservations: BlockingReservation[]
  /** Same real HangarItem row a Tier 1 candidate would carry — the row
   * already exists (a reservation commits against existing Hangar stock,
   * it doesn't create a separate record); releasing the blocking
   * reservation(s) frees it, at which point installing by this id keeps
   * bookkeeping correct exactly like Tier 1. */
  hangarItemId?: string
}

export interface BorrowInstallCandidate {
  item: string
  entityClass?: string
  label: string
  shipId: string
  shipName: string
  slotLabel: string
  buildName: string
}

export interface PlainInstallCandidate {
  item: string
  entityClass?: string
  label: string
}

export interface InstallCandidateSet {
  availableInventory: OwnedInstallCandidate[]
  reserved: ReservedInstallCandidate[]
  borrowable: BorrowInstallCandidate[]
  remainingCompatible: PlainInstallCandidate[]
}

export function deriveInstallCandidates(
  candidates: TargetComponentOption[],
  params: {
    currentShipId: string
    currentBuildId: string
    currentSlotLabel: string
    /** Excluded from every tier — re-offering the port's own current
     * installed component as something to "install" is never useful. */
    currentlyInstalledItem?: string
    hangarItems: HangarItem[]
    installedLoadouts: InstalledLoadoutEntry[]
    reservations: MissionReservation[]
    ships: Ship[]
    builds: Build[]
  }
): InstallCandidateSet {
  const { currentShipId, currentBuildId, currentSlotLabel, currentlyInstalledItem, hangarItems, installedLoadouts, reservations, ships, builds } = params

  const availableInventory: OwnedInstallCandidate[] = []
  const reserved: ReservedInstallCandidate[] = []
  const borrowable: BorrowInstallCandidate[] = []
  const remainingCompatible: PlainInstallCandidate[] = []

  const seenItems = new Set<string>()
  for (const candidate of candidates) {
    if (candidate.item === '—') continue
    if (currentlyInstalledItem && currentlyInstalledItem !== '—' && candidate.item === currentlyInstalledItem) continue
    if (seenItems.has(candidate.item)) continue
    seenItems.add(candidate.item)

    const label = candidate.label ?? candidate.item
    const availability = calculateComponentAvailability(candidate.item, hangarItems, installedLoadouts, reservations, candidate.entityClass)
    const candidateIdentity = identityFor(candidate.item, candidate.entityClass)
    const matchingHangarItemId = hangarItems.find((h) => h.qty > 0 && identitiesMatch(candidateIdentity, identityFor(h.name, h.entityClass)))?.id

    if (availability.availableQuantity > 0) {
      availableInventory.push({ item: candidate.item, entityClass: candidate.entityClass, label, quantity: availability.availableQuantity, reservedForThisPort: false, hangarItemId: matchingHangarItemId })
      continue
    }

    const ownReservation = findActiveSlotReservation(reservations, {
      missionConfigurationId: currentBuildId,
      targetSlotLabel: currentSlotLabel,
      componentName: candidate.item,
      componentEntityClass: candidate.entityClass,
    })
    if (ownReservation) {
      availableInventory.push({ item: candidate.item, entityClass: candidate.entityClass, label, quantity: ownReservation.quantity, reservedForThisPort: true, hangarItemId: matchingHangarItemId })
      continue
    }

    if (availability.reservedQuantity > 0) {
      const identity = identityFor(candidate.item, candidate.entityClass)
      const blockingReservations: BlockingReservation[] = reservations
        .filter((r) => r.status === 'ACTIVE' && identitiesMatch(identity, identityFor(r.componentName, r.componentEntityClass ?? undefined)))
        .map((r) => ({
          id: r.id,
          shipName: ships.find((s) => builds.find((b) => b.id === r.missionConfigurationId)?.shipId === s.id)?.name ?? 'Unknown Ship',
          buildName: builds.find((b) => b.id === r.missionConfigurationId)?.name ?? 'Unknown Loadout',
          slotLabel: r.targetSlotLabel,
        }))
      reserved.push({ item: candidate.item, entityClass: candidate.entityClass, label, blockingReservations, hangarItemId: matchingHangarItemId })
      continue
    }

    const installedElsewhere = installedLoadouts.filter(
      (e) => e.shipId !== currentShipId && identitiesMatch(identityFor(candidate.item, candidate.entityClass), identityFor(e.installedItem, e.entityClass))
    )
    if (installedElsewhere.length > 0) {
      for (const entry of installedElsewhere) {
        const donorShip = ships.find((s) => s.id === entry.shipId)
        const donorBuild = builds.find((b) => b.id === donorShip?.activeBuildId)
        borrowable.push({
          item: candidate.item,
          entityClass: candidate.entityClass,
          label,
          shipId: entry.shipId,
          shipName: donorShip?.name ?? 'Unknown Ship',
          slotLabel: entry.slotLabel,
          buildName: donorBuild?.name ?? 'Active Loadout',
        })
      }
      continue
    }

    remainingCompatible.push({ item: candidate.item, entityClass: candidate.entityClass, label })
  }

  return { availableInventory, reserved, borrowable, remainingCompatible }
}
