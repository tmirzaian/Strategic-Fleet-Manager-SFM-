import type { Build, HangarItem, InstalledLoadoutEntry, MissionReservation, Ship } from '../types'
import type { TargetComponentOption } from '../components/TargetComponentPicker'
import { calculateComponentAvailability } from '../engine/logistics/availability'
import { findActiveSlotReservation } from '../engine/logistics/reservationLookup'
import { identitiesMatch, type ResolvedComponentIdentity } from '../engine/installation/componentIdentityService'
import { resolveComponentByEntityClass, resolveComponentByName } from '../generated/componentCatalog'
import { resolveComponentLabel } from './componentPresentation'

/**
 * EWO-071 — "Install/Change Source Ladder Refactor." Supersedes SW-014A's
 * original five-bucket model (Reserved-elsewhere/Available/Borrow/
 * Remaining Compatible) with exactly four canonical, priority-ordered
 * groups a Commander physically installing a component actually needs:
 * RESERVED > AVAILABLE > UPGRADE > BORROW. "The Commander should see only
 * realistic choices for satisfying or improving the selected port" — an
 * open-ended catalog browse (the old "Remaining Compatible Components")
 * is gone outright (deferred to a future Hangar Inventory refactor); a
 * component reserved for a DIFFERENT Loadout (the old "reassign" tier) no
 * longer renders here either — releasing another Loadout's own commitment
 * is a bigger decision than this simplified ladder is meant to carry, and
 * every one of Part H's four groups is an exhaustive, closed list.
 *
 * EWO-071A (Part A) — refines the Reserved/Available relationship for the
 * exact Target: EWO-071 originally let a Reserved row and an Available
 * row render side by side when the Target had both a committed unit and
 * separate genuinely-free stock. Commander testing found this made the
 * Commander inspect both sections before discovering the reserved copy
 * was there at all. Reserved now always wins outright whenever it
 * applies — the Available group never independently renders for the same
 * Target a Reserved row already covers; any additional genuinely-free
 * stock instead folds into that SAME Reserved row as a compact secondary
 * line ("+N additional available"), never a second competing group.
 *
 * This is read/presentation-only: every actual mutation still goes
 * through the existing `installComponent`/`removeComponent` store actions
 * (the one shared installation engine) — this module never touches
 * inventory, reservations, or hardpoints itself.
 */

function identityFor(item: string, entityClass?: string): ResolvedComponentIdentity {
  return { displayName: item, entityClass: entityClass ?? null, category: null, size: null }
}

/** Lower is better (1 = Grade A ... 4 = Grade D) — the same numeric
 * convention `componentPresentation.ts`'s `GRADE_LETTERS` already
 * establishes app-wide. Prefers the entityClass-keyed catalog record (more
 * specific) over the display-name-keyed one, same precedence
 * `resolveComponentLabel` already uses elsewhere for this exact field.
 *
 * EWO-083 — previously a fourth, independent reimplementation of the
 * entityClass-then-name catalog lookup, reading the LEGACY, player-
 * selectable-restricted maps (`catalogComponentsByEntityClass`/
 * `catalogComponentsByName`) directly. Migrated to call the same base
 * generated-layer functions (`resolveComponentByEntityClass`/
 * `resolveComponentByName`) `src/data/componentCatalog.ts`'s own
 * canonical `resolveCandidate` is built on — genuinely one shared
 * resolution path now, not a fourth reimplementation.
 *
 * Deliberately does NOT route through
 * `resolveComponentCatalogEntryDetailed` (componentCatalog.ts's full
 * compatibility-oriented resolver): that function checks the
 * hand-authored `CATALOG` override table first, and override entries
 * never carry a `grade` (confirmed — they predate that tracking).
 * Routing grade lookups through it would silently null out the grade for
 * any component whose name happens to match an override key, a real
 * regression found and reverted during this mission's own test pass
 * (`sw014aInlineInstalledComponentWorkflow.test.tsx`'s UPGRADE-group
 * cases). Grade is a presentation attribute the override table was never
 * meant to shadow, so this stays on the base layer only. */
function resolveGrade(item: string, entityClass?: string): number | null {
  if (entityClass) {
    const byEntityClass = resolveComponentByEntityClass(entityClass)
    if (byEntityClass.status === 'resolved' && byEntityClass.record.grade !== null) return byEntityClass.record.grade
  }
  const byName = resolveComponentByName(item)
  if (byName.status === 'resolved') return byName.record.grade
  if (byName.status === 'ambiguous') return byName.candidates[0]?.grade ?? null
  return null
}

export interface ReservedInstallCandidate {
  item: string
  entityClass?: string
  label: string
  /** The reservation's own committed quantity — installing it just
   * fulfills that commitment, per `installComponent`'s own behavior. */
  quantity: number
  hangarItemId?: string
  /** EWO-071A (Part A) — genuinely free stock of this SAME exact Target,
   * beyond what's already committed by this reservation. Never a second
   * Available row/group — folded into this row as a compact secondary
   * indicator ("+N additional available") instead. Zero/undefined when no
   * such extra stock exists. */
  additionalAvailableQuantity?: number
}

export interface AvailableInstallCandidate {
  item: string
  entityClass?: string
  label: string
  /** Genuinely free stock, separate from anything already reserved. */
  quantity: number
  hangarItemId?: string
}

export interface UpgradeInstallCandidate {
  item: string
  entityClass?: string
  label: string
  quantity: number
  hangarItemId?: string
  /** Compact "{Class} {Grade}" subtitle (e.g. "Military B"), the same
   * `resolveComponentLabel().classificationLabel` every other component
   * presentation surface already renders — null when neither is known. */
  classificationLabel: string | null
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

export interface InstallCandidateSet {
  reserved: ReservedInstallCandidate[]
  available: AvailableInstallCandidate[]
  upgrade: UpgradeInstallCandidate[]
  borrowable: BorrowInstallCandidate[]
}

export function deriveInstallCandidates(
  candidates: TargetComponentOption[],
  params: {
    currentShipId: string
    currentBuildId: string
    currentSlotLabel: string
    targetItem?: string
    targetEntityClass?: string
    /** Excluded from every group — re-offering the port's own current
     * installed component as something to "install" is never useful. */
    currentlyInstalledItem?: string
    currentlyInstalledEntityClass?: string
    hangarItems: HangarItem[]
    installedLoadouts: InstalledLoadoutEntry[]
    reservations: MissionReservation[]
    ships: Ship[]
    builds: Build[]
  }
): InstallCandidateSet {
  const {
    currentShipId,
    currentBuildId,
    currentSlotLabel,
    targetItem,
    targetEntityClass,
    currentlyInstalledItem,
    currentlyInstalledEntityClass,
    hangarItems,
    installedLoadouts,
    reservations,
    ships,
    builds,
  } = params

  const reserved: ReservedInstallCandidate[] = []
  const available: AvailableInstallCandidate[] = []
  const upgrade: UpgradeInstallCandidate[] = []
  const borrowable: BorrowInstallCandidate[] = []

  // Cross-group dedup (EWO-071 Part H, refined by EWO-071A Part A): a
  // component that already renders in a higher-priority group
  // (Reserved > Available > Upgrade > Borrow) never renders again in a
  // lower one — including the exact Target's own Reserved/Available
  // relationship, which EWO-071A now collapses into a single Reserved row
  // (see this module's own leading doc comment) rather than two
  // competing groups.
  const seenItems = new Set<string>()

  const hasRealTarget = !!targetItem && targetItem !== '—' && targetItem !== currentlyInstalledItem
  if (hasRealTarget) {
    const targetOption = candidates.find((c) => c.item === targetItem)
    const label = targetOption?.label ?? targetItem!
    const targetIdentity = identityFor(targetItem!, targetEntityClass)
    const matchingHangarItemId = hangarItems.find((h) => h.qty > 0 && identitiesMatch(targetIdentity, identityFor(h.name, h.entityClass)))?.id

    const ownReservation = findActiveSlotReservation(reservations, {
      missionConfigurationId: currentBuildId,
      targetSlotLabel: currentSlotLabel,
      componentName: targetItem!,
      componentEntityClass: targetEntityClass,
    })
    const availability = calculateComponentAvailability(targetItem!, hangarItems, installedLoadouts, reservations, targetEntityClass)
    if (ownReservation) {
      // EWO-071A (Part A) — Reserved wins outright: any additional
      // genuinely-free stock of this same Target folds into THIS row,
      // never a separate Available group.
      reserved.push({
        item: targetItem!,
        entityClass: targetEntityClass,
        label,
        quantity: ownReservation.quantity,
        hangarItemId: matchingHangarItemId,
        additionalAvailableQuantity: availability.availableQuantity > 0 ? availability.availableQuantity : undefined,
      })
      seenItems.add(targetItem!)
    } else if (availability.availableQuantity > 0) {
      available.push({ item: targetItem!, entityClass: targetEntityClass, label, quantity: availability.availableQuantity, hangarItemId: matchingHangarItemId })
      seenItems.add(targetItem!)
    }
  }

  // Upgrade — an owned, genuinely-free candidate other than the Target
  // itself whose real Grade is strictly better than what's currently
  // Installed (lower number; see `resolveGrade`'s own doc comment). A
  // candidate with unknown Grade, or Installed with unknown Grade, never
  // qualifies — an unconfirmed improvement is not shown as one.
  const installedGrade = currentlyInstalledItem ? resolveGrade(currentlyInstalledItem, currentlyInstalledEntityClass) : null
  for (const candidate of candidates) {
    if (candidate.item === '—') continue
    if (currentlyInstalledItem && candidate.item === currentlyInstalledItem) continue
    if (candidate.item === targetItem) continue
    if (seenItems.has(candidate.item)) continue

    const availability = calculateComponentAvailability(candidate.item, hangarItems, installedLoadouts, reservations, candidate.entityClass)
    if (availability.availableQuantity <= 0) continue

    const candidateGrade = resolveGrade(candidate.item, candidate.entityClass)
    if (installedGrade === null || candidateGrade === null || candidateGrade >= installedGrade) continue

    const candidateIdentity = identityFor(candidate.item, candidate.entityClass)
    const matchingHangarItemId = hangarItems.find((h) => h.qty > 0 && identitiesMatch(candidateIdentity, identityFor(h.name, h.entityClass)))?.id
    upgrade.push({
      item: candidate.item,
      entityClass: candidate.entityClass,
      label: candidate.label ?? candidate.item,
      quantity: availability.availableQuantity,
      hangarItemId: matchingHangarItemId,
      classificationLabel: resolveComponentLabel(candidate.item).classificationLabel,
    })
    seenItems.add(candidate.item)
  }

  // Borrow — last resort, whatever remains: a compatible candidate
  // (including the Target itself, when no owned copy exists anywhere)
  // physically installed on another ship.
  for (const candidate of candidates) {
    if (candidate.item === '—') continue
    if (currentlyInstalledItem && candidate.item === currentlyInstalledItem) continue
    if (seenItems.has(candidate.item)) continue

    const installedElsewhere = installedLoadouts.filter(
      (e) => e.shipId !== currentShipId && identitiesMatch(identityFor(candidate.item, candidate.entityClass), identityFor(e.installedItem, e.entityClass))
    )
    if (installedElsewhere.length === 0) continue

    const label = candidate.label ?? candidate.item
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
  }

  return { reserved, available, upgrade, borrowable }
}
