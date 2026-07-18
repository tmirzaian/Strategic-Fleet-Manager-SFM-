import type { MissionReservation } from '../../types'
import { identitiesMatch } from '../installation/componentIdentityService'

/**
 * EWO-STAB-003E (ADR-010) — the one shared "find the active reservation
 * already committed to this exact Mission+slot+component" lookup. Before
 * this mission, `procurement.ts`, `portTree.ts`, and `missionPackage.ts`
 * each independently reimplemented an identical predicate (see the
 * EWO-STAB-003D/003E audits) — three copies that happened to agree, not
 * one shared decision. This module is that one decision.
 *
 * Scope is unchanged from every prior copy: `missionConfigurationId` +
 * `targetSlotLabel` + `status === 'ACTIVE'`. `shipId` is not checked
 * separately — `missionConfigurationId` already uniquely identifies one
 * Fleet Asset's Mission Configuration, exactly as it did in every original
 * copy. There is no reservation concept narrower than a single slot within
 * a single Mission Configuration to scope against.
 */
export interface SlotReservationQuery {
  missionConfigurationId: string
  targetSlotLabel: string
  componentName: string
  /** Optional — absent for a legacy caller/target with no resolved
   * identity. Never fabricated by this module; callers pass through
   * whatever they already have (a Hardpoint's own targetEntityClass). */
  componentEntityClass?: string | null
}

/**
 * The approved identity rule (EWO-STAB-003D/003E), applied here exactly as
 * it is in hardpointStatus.ts/availability.ts: when BOTH the reservation
 * and the requested component resolve an entityClass, they match if and
 * only if that entityClass is equal — a shared display name is never
 * sufficient once a stronger signal exists on both sides. When either side
 * lacks one, this falls back to the EXACT historical comparison every one
 * of the three original callers used (`r.componentName === componentName`,
 * case-sensitive) — never to `identitiesMatch`'s own case-insensitive
 * display-name fallback, which would silently loosen behavior none of the
 * three callers ever had.
 */
function reservationMatchesComponent(reservation: MissionReservation, componentName: string, componentEntityClass: string | null | undefined): boolean {
  if (reservation.componentEntityClass && componentEntityClass) {
    return identitiesMatch(
      { displayName: reservation.componentName, entityClass: reservation.componentEntityClass, category: null, size: null },
      { displayName: componentName, entityClass: componentEntityClass, category: null, size: null }
    )
  }
  return reservation.componentName === componentName
}

/**
 * Returns the single ACTIVE reservation committed to this exact
 * Mission+slot+component, or undefined. `reservations.find` preserves the
 * exact search behavior every prior copy already had; a correctly-formed
 * fleet only ever has at most one ACTIVE reservation per (missionConfigurationId,
 * targetSlotLabel) — `saveMissionConfiguration` releases any stale one the
 * moment a target edit stops matching it — so which one `.find` would
 * return first is not a meaningful question in practice, only a defensive
 * one.
 */
export function findActiveSlotReservation(reservations: MissionReservation[], query: SlotReservationQuery): MissionReservation | undefined {
  return reservations.find(
    (r) =>
      r.missionConfigurationId === query.missionConfigurationId &&
      r.targetSlotLabel === query.targetSlotLabel &&
      r.status === 'ACTIVE' &&
      reservationMatchesComponent(r, query.componentName, query.componentEntityClass)
  )
}
