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

/**
 * CWO-005 (Task 3) — the 12 seed-id entries above are now shadowed for
 * filtering purposes: MWO-001 aliased each of these hulls to its real
 * deep-imported definition, so the ShipDefinition object Fleet Dashboard
 * actually filters is keyed by the deep-import's own id, not the seed id
 * — `classificationFor` would never find these hand-reviewed entries for
 * the ship that's actually shown today, and would silently fall back to
 * a thinner catalog-derived single-role classification instead (still
 * correct, but loses hand-reviewed nuance like Corsair's 'Combat' +
 * 'Exploration' pair). This maps each seed id to the raw StarBreaker
 * entity class its real deep-imported counterpart resolves as — the same
 * relationship shipDefinitions.ts's SEED_HULL_GROUP_ALIASES documents for
 * Ghost specifically — purely to extend the classification lookup, never
 * to affect naming/grouping.
 */
const SEED_ID_TO_DEEP_IMPORT_ENTITY_CLASS: Record<string, string> = {
  ghost: 'ANVL_Hornet_F7CS_Mk2',
  corsair: 'DRAK_Corsair',
  mole: 'ARGO_MOLE',
  railen: 'GAMA_Railen',
  '135c': 'ORIG_135c',
  'cutlass-black': 'DRAK_Cutlass_Black',
  'cutlass-red': 'DRAK_Cutlass_Red',
  m80: 'ORIG_m80',
  starlite: 'MISC_Starlite',
  utv: 'GRIN_UTV',
  vulture: 'DRAK_Vulture',
  prospector: 'MISC_Prospector',
}
for (const [seedId, entityClass] of Object.entries(SEED_ID_TO_DEEP_IMPORT_ENTITY_CLASS)) {
  classifications[entityClass] = classifications[seedId]
}

const UNKNOWN_CLASSIFICATION: ShipClassification = { rsiRoles: [], focusTags: [], source: 'UNKNOWN' }

/**
 * CWO-005 (Task 3) — normalizes the universe catalog's own CIG/DataCore
 * focus taxonomy (`@vehicle_focus_*` career keys, via their resolved
 * localized names) onto SFM's RsiRole filter set. This is the SAME
 * authoritative source shipDefinitions.ts's canonical naming already
 * reads (generated-data/ship-catalog.json), confirmed by direct audit to
 * cover 295 of the 299 real catalog records with a clean, direct mapping.
 */
const RSI_ROLE_BY_NORMALIZED_CAREER_NAME: Record<string, RsiRole> = {
  combat: 'Combat',
  competition: 'Competition',
  exploration: 'Exploration',
  ground: 'Ground',
  'multi-role': 'Multi-role',
  industrial: 'Industrial',
  support: 'Support',
  transport: 'Transport',
  transporter: 'Transport',
}

/**
 * CWO-005 (Task 3) — a handful of hulls use a one-off DataCore career key
 * outside the standard `@vehicle_focus_*` taxonomy (a hull-class key or an
 * item-level focus key instead) — confirmed by direct audit to be the
 * only 4 such cases among the full 299-record universe catalog. Hand-
 * reviewed against each hull's real-world role, the same review standard
 * as the manual `classifications` table above.
 */
const KNOWN_CAREER_KEY_ROLE_OVERRIDES: Record<string, RsiRole> = {
  '@vehicle_class_destroyer': 'Combat', // AEGS_Javelin
  '@item_ShipFocus_Gunship': 'Combat', // ANVL_Paladin
  '@item_ShipFocus_Starter': 'Transport', // CRUS_Intrepid ("Starter / Light Freight")
  '@item_ShipFocus_Transport': 'Transport', // DRAK_Command_Module
}

/** Derives a real RsiRole from the universe catalog's own career data.
 * Returns undefined (never a guess) when neither the resolved name nor
 * the raw key is recognized. */
function rsiRoleFromCatalogCareer(careerName: string | null | undefined, careerKey: string | null | undefined): RsiRole | undefined {
  const normalized = careerName?.toLowerCase().trim()
  if (normalized && RSI_ROLE_BY_NORMALIZED_CAREER_NAME[normalized]) return RSI_ROLE_BY_NORMALIZED_CAREER_NAME[normalized]
  if (careerKey && KNOWN_CAREER_KEY_ROLE_OVERRIDES[careerKey]) return KNOWN_CAREER_KEY_ROLE_OVERRIDES[careerKey]
  return undefined
}

/**
 * Looks up a ship definition's classification by id first — the manual
 * table above, reserved for cases needing a deliberate, non-obvious call
 * (e.g. Corsair's classification is independent of its current custom
 * loadout's Role text). When no manual entry exists, CWO-005 (Task 3)
 * falls back to the real universe catalog's own CIG/DataCore career/focus
 * data rather than an unconditional "unknown" — this is what restores
 * role filtering for the 250+ deep-imported and catalog-only hulls the
 * 14-entry manual table was never extended to cover after Golden Fleet
 * promotion. Only when neither source resolves does this fall back to
 * the explicit "unknown" classification (empty role list, `source:
 * 'UNKNOWN'`) — an unclassified ship simply won't match any role filter
 * until real data exists for it, never a guess.
 */
export function classificationFor(
  shipDefinitionId: string,
  catalogCareer?: { careerName?: string | null; careerKey?: string | null; category?: 'ship' | 'ground_vehicle' },
  entityClass?: string
): ShipClassification {
  const handAuthored = classifications[shipDefinitionId] ?? (entityClass ? classifications[entityClass] : undefined)
  if (handAuthored) return handAuthored
  const derivedRole = catalogCareer ? rsiRoleFromCatalogCareer(catalogCareer.careerName, catalogCareer.careerKey) : undefined
  if (!derivedRole) return UNKNOWN_CLASSIFICATION
  return {
    rsiRoles: [derivedRole],
    focusTags: [],
    vehicleKind: catalogCareer?.category === 'ground_vehicle' ? 'Ground Vehicle' : 'Ship',
    source: 'CIG_DATA',
  }
}

export const ALL_RSI_ROLES: RsiRole[] = ['Combat', 'Transport', 'Exploration', 'Industrial', 'Support', 'Competition', 'Ground', 'Multi-role']
