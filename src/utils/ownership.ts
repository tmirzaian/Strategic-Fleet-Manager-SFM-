import type { Ownership, OwnershipType } from '../types'

/**
 * `OwnershipType` ('OWNED'|'PURCHASED'|'LOANER') is the FleetAsset-facing
 * enum the sprint brief specifies. The existing `Ship.ownership` field
 * (and Badge.tsx's `ownershipTone`, used throughout the UI already) uses
 * title-case strings ('Owned'|'Purchased'|'Loaner') instead. Rather than
 * rename that field and its many call sites, these two small converters
 * keep the new enum and the existing rendering code both intact.
 */
export function ownershipTypeToLegacy(type: OwnershipType): Ownership {
  switch (type) {
    case 'OWNED':
      return 'Owned'
    case 'PURCHASED':
      return 'Purchased'
    case 'LOANER':
      return 'Loaner'
  }
}

export function legacyToOwnershipType(ownership: Ownership): OwnershipType {
  switch (ownership) {
    case 'Owned':
      return 'OWNED'
    case 'Purchased':
      return 'PURCHASED'
    case 'Loaner':
      return 'LOANER'
  }
}

export const OWNERSHIP_TYPE_LABELS: Record<OwnershipType, string> = {
  OWNED: 'Owned — RSI/Pledged',
  PURCHASED: 'Purchased — In-game',
  LOANER: 'Loaner',
}
