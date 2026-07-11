import type { RsiRole, ShipClassification } from '../types'

/**
 * Centralized, temporary classification map for current demo data
 * (Alpha 2.1). This is the ONE place ship->RSI-role mapping lives —
 * Fleet Dashboard filters read `ShipDefinition.classification.rsiRoles`
 * and never branch on ship id, Build name, or free-text Role themselves.
 * Adding a future Ship Definition here (or via a real RSI role resolver
 * later) is all that's needed for it to appear under the right filter —
 * no UI code changes per ship.
 *
 * Never derived from: active Build name, custom Role text, or Fleet
 * Asset nickname — those are player-facing strings, not classification
 * data, and can't be trusted to stay consistent.
 */
const classifications: Record<string, ShipClassification> = {
  ghost: { rsiRoles: ['Combat'], focusTags: ['Stealth', 'Fighter'], vehicleKind: 'Ship', source: 'MANUAL_SEED' },
  // Classification is independent of Role — the Corsair is officially
  // classified Combat/Exploration by RSI/CIG even though its current
  // custom loadout's role text says "Gunship" (Alpha 2.4, Part 9: never
  // infer classification from the current loadout).
  corsair: { rsiRoles: ['Combat', 'Exploration'], focusTags: ['Gunship'], vehicleKind: 'Ship', source: 'RSI' },
  mole: { rsiRoles: ['Industrial'], focusTags: ['Mining'], vehicleKind: 'Ship', source: 'MANUAL_SEED' },
  railen: { rsiRoles: ['Transport'], focusTags: ['Cargo'], vehicleKind: 'Ship', source: 'MANUAL_SEED' },
  '135c': { rsiRoles: ['Transport'], focusTags: ['Stealth', 'Shuttle'], vehicleKind: 'Ship', source: 'MANUAL_SEED' },
  'cutlass-black': { rsiRoles: ['Multi-role'], focusTags: ['Daily Driver'], vehicleKind: 'Ship', source: 'MANUAL_SEED' },
  'cutlass-red': { rsiRoles: ['Support'], focusTags: ['Medical', 'Rescue'], vehicleKind: 'Ship', source: 'MANUAL_SEED' },
  m80: { rsiRoles: ['Competition', 'Combat'], focusTags: ['Racing', 'Interceptor'], vehicleKind: 'Ship', source: 'MANUAL_SEED' },
  starlite: { rsiRoles: ['Multi-role'], focusTags: ['Unknown'], vehicleKind: 'Ship', source: 'UNKNOWN' },
  utv: { rsiRoles: ['Ground'], focusTags: ['Utility'], vehicleKind: 'Ground Vehicle', source: 'MANUAL_SEED' },
  vulture: { rsiRoles: ['Industrial'], focusTags: ['Salvage'], vehicleKind: 'Ship', source: 'MANUAL_SEED' },
  prospector: { rsiRoles: ['Industrial'], focusTags: ['Mining', 'Solo'], vehicleKind: 'Ship', source: 'MANUAL_SEED' },
  'gladius-imported': { rsiRoles: ['Combat'], focusTags: ['Fighter'], vehicleKind: 'Ship', source: 'CIG_DATA' },
  'avenger-titan-imported': { rsiRoles: ['Combat', 'Transport'], focusTags: ['Light Cargo', 'Combat'], vehicleKind: 'Ship', source: 'CIG_DATA' },
}

const UNKNOWN_CLASSIFICATION: ShipClassification = { rsiRoles: [], focusTags: [], source: 'UNKNOWN' }

/**
 * Looks up a ship definition's classification by id, falling back to an
 * explicit "unknown" classification (empty role list, `source: 'UNKNOWN'`)
 * rather than guessing — an unclassified ship simply won't match any role
 * filter until real data exists for it.
 */
export function classificationFor(shipDefinitionId: string): ShipClassification {
  return classifications[shipDefinitionId] ?? UNKNOWN_CLASSIFICATION
}

export const ALL_RSI_ROLES: RsiRole[] = ['Combat', 'Transport', 'Exploration', 'Industrial', 'Support', 'Competition', 'Ground', 'Multi-role']
