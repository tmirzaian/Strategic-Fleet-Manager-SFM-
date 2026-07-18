import { validateTargetCompatibility } from '../../data/componentCatalog'
import type { ResolvedComponentIdentity } from './componentIdentityService'

/**
 * EWO-STAB-003B — the single compatibility enforcement authority
 * (EWO-STAB-003A §3). Reuses the exact existing catalog-based check
 * (validateTargetCompatibility, itself built on isCompatible) rather than
 * reimplementing it — no compatibility rule changes, no new
 * restrictions. This is the same check EWO-STAB-002 already wired
 * directly into installComponent's explicit-slot path; it is relocated
 * here so every operation (INSTALL, REMOVE's implicit re-check, TRANSFER)
 * shares one call site instead of each duplicating it.
 *
 * `mode: 'exact-slot-match'` is the one deliberate exception: it
 * preserves moveComponentBetweenShips' own, pre-existing, intentionally
 * different rule (destination must equal the donor hardpoint's own
 * type/size, verbatim, with no catalog lookup at all) rather than
 * silently switching that caller onto the catalog rule — which would be
 * a compatibility-rule change, explicitly out of scope for this mission.
 * It is a second MODE of the one engine, not a second engine.
 */
export interface CompatibilityCheckResult {
  compatible: boolean
  message?: string
}

export interface DestinationSlot {
  type: string
  size: string
}

export function checkInstallationCompatibility(
  identity: ResolvedComponentIdentity,
  destinationSlot: DestinationSlot,
  options?: { mode?: 'catalog' | 'exact-slot-match'; referenceSlot?: DestinationSlot }
): CompatibilityCheckResult {
  if (options?.mode === 'exact-slot-match') {
    const reference = options.referenceSlot
    if (!reference) throw new Error('checkInstallationCompatibility: exact-slot-match mode requires referenceSlot.')
    const compatible = destinationSlot.type === reference.type && destinationSlot.size === reference.size
    return compatible
      ? { compatible: true }
      : { compatible: false, message: `${identity.displayName} (${reference.size} ${reference.type}) is not compatible with a ${destinationSlot.size} ${destinationSlot.type} slot.` }
  }

  const validation = validateTargetCompatibility(identity.displayName, destinationSlot.type, destinationSlot.size)
  return { compatible: validation.valid, message: validation.message }
}
