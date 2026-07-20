import { isCompatible } from '../engine/compatibility'
import type { Component, CompatibilityRule } from '../engine/types'
import {
  compatibilityPortTypeFor,
  resolveComponentByEntityClass,
  resolveComponentByName,
  type CanonicalComponentRecord,
} from '../generated/componentCatalog'

/**
 * Demo component catalog — category + size for the named items that
 * appear in seed hardpoint data, so target items can be validated against
 * their Port's size/type constraints using the real compatibility engine
 * (src/engine/compatibility), not a one-off ad hoc check.
 *
 * This is deliberately a small hand-authored table, not real CIG data —
 * there is no importer yet (see docs/DATA_ENGINE.md). An item that isn't
 * listed here is treated as "unknown, assume compatible" rather than
 * invalid; we only want to flag a target as INVALID TARGET when we can
 * positively confirm a mismatch, not whenever data happens to be missing.
 */
interface CatalogEntry {
  /** Translated port-type vocabulary (e.g. "Weapon", "Shield"). For a
   * PDCTurret-subtype entry this is whatever CATEGORY_TO_PORT_TYPE maps
   * raw category "Turret" to (VRF-002: now "Gimbal Mount", same as
   * WeaponMount) — irrelevant in practice either way, since a PDCTurret
   * entry is never evaluated through the ordinary category/size path
   * below (see `subtype`), only through its own dedicated PDC rule. */
  category: string
  size: number
  // EWO-STAB-003B — present only when resolution came from the generated
  // catalog (src/generated/componentCatalog.ts), never from the
  // hand-authored CATALOG table below, which predates entity-class
  // tracking and was never retrofitted with one. Reflects data that was
  // already being returned here; this widens the type to expose it, it
  // does not change what resolveCatalogEntry returns.
  entityClass?: string
  /** EWO-STAB-004A (ADR-010, CAT-003) — DataCore's raw, untranslated
   * SubType (e.g. "Gun", "GunTurret", "PDCTurret"). Present only when
   * resolution came from the generated catalog; undefined for a
   * hand-authored CATALOG entry, which predates subtype tracking and has
   * no PDC-relevant entries to begin with. This is the ONLY field the PDC
   * rules below read — never `category`, which stays in the ordinary,
   * unrelated port-type vocabulary. */
  subtype?: string | null
}

const CATALOG: Record<string, CatalogEntry> = {
  // Quantum Drives — the sprint's explicit example: Atlas is an S1 drive.
  Atlas: { category: 'Quantum Drive', size: 1 },

  // Power Plants
  Slipstream: { category: 'Power Plant', size: 1 },

  // Shields
  Mirage: { category: 'Shield', size: 1 },
  'FR-66': { category: 'Shield', size: 1 },
  Debilitator: { category: 'Shield', size: 1 },
  'Shield Array': { category: 'Shield', size: 2 },
  // FR-86 is an S3 Shield, not a Missile Rack — Alpha 2.4 Part 10 fix
  // (it was previously miscategorized here, which would have produced an
  // incorrect INVALID TARGET result against any real S3 Shield port).
  'FR-86': { category: 'Shield', size: 3 },

  // Coolers
  Snowblind: { category: 'Cooler', size: 1 },
  'CoolCore II': { category: 'Cooler', size: 1 },
  Blizzard: { category: 'Cooler', size: 2 },
  'Military Cooler': { category: 'Cooler', size: 2 },

  // Weapons
  'Mass Driver': { category: 'Weapon', size: 4 },
  Revenant: { category: 'Weapon', size: 4 },
  // Turret child weapons (Alpha 2.5C port-tree fixtures)
  'Turret Repeater': { category: 'Weapon', size: 3 },

  // Mining
  'Helix II': { category: 'Mining Laser', size: 2 },
  'Rieger-C3': { category: 'Mining Module', size: 1 },
  'Arbor MH1': { category: 'Mining Laser', size: 1 },

  // Utility / Cargo / Salvage / Missiles
  'Tractor Beam': { category: 'Utility', size: 2 },
  'Salvage Head (RM Series)': { category: 'Salvage Module', size: 2 },

  // EWO-023 (Task 6 follow-on) — these two display names are not unique
  // across the Mission M-012 bulk catalog (generated-data/component-metadata-catalog.json):
  // multiple real entity classes at different sizes share the same
  // resolved name, and catalogComponentsByName's "first entry wins"
  // dedup can pick a differently-sized variant than the one actually
  // installed on a given ship. Overridden here with the category/size of
  // the entity class genuinely installed on the real ship that carries
  // it (confirmed against generated-data/components.json), the same
  // pattern already established above for FR-86.
  'Revenant Gatling': { category: 'Weapon', size: 4 }, // Avenger Titan's nose gun — APAR_BallisticGatling_S4
  'MSD-313 Missile Rack': { category: 'Missile Rack', size: 3 }, // Gladius's inner wing racks — MRCK_S03_BEHR_Single_S03

  // MWO-001 (Task 4/5) — the same "first entry wins" bulk-catalog dedup
  // gap, newly exercised at scale by the 4.9 Golden Fleet promotion (250
  // additional deep-imported hulls). Each entry below is the category/size
  // genuinely installed on the real ship(s) that carry it (confirmed by
  // direct compatibility audit against every deep-imported ship's own
  // Factory Loadout, generated-data/ships.json).
  'MSD-683 Missile Rack': { category: 'Missile Rack', size: 7 }, // Asgard's torpedo racks
  'Anvil F7C-M Mk II Missile Rack': { category: 'Gimbal Mount', size: 4 }, // Hornet F7CM Mk2's own remote-turret hardware
  'Tarantula GT-870 Mark 3 Cannon': { category: 'Weapon', size: 3 }, // Hornet F7C Wildfire / Lightning F8C's nose gun
  // FTB-001D — the four mining-laser overrides formerly here ('Arbor MH2
  // Mining Laser', 'Pitman Mining Laser', 'Arbor MHV Mining Laser', 'Arbor
  // MH1 Mining Laser', each forced to category 'Mining') are gone: they
  // existed only to compensate for every real mining weapon port's own
  // type field being the untranslated raw string "Mining" instead of the
  // catalog's actual "Mining Laser" vocabulary — fixed at the true source
  // (src/data/shipDefinitions.ts's compatibilityTypeFor, Mining ->
  // "Mining Laser") rather than patched per display name here. Leaving
  // these entries in would now force the WRONG category against a port
  // that correctly reads "Mining Laser", breaking the exact components
  // they used to fix. Every real mining laser (Helix I/II, Impact I/II,
  // Lancet MH1/MH2, Klein-S1/S2, Hofstede-S1/S2, Arbor MH1/MH2/MHV,
  // Pitman, and any future one) now resolves generically, with no
  // per-name override required.
  'Reliant Tana Missile Launcher': { category: 'Missile Rack', size: 5 }, // Reliant Tana's own launcher hardware
  'MSD-616 Missile Rack': { category: 'Gimbal Mount', size: 4 }, // Starlancer TAC's own remote-turret hardware
  'RSI Polaris Torpedo Rack': { category: 'Missile Rack', size: 10 }, // Polaris's torpedo bays
  'RSI Polaris Remote Turret Missile Rack': { category: 'Gimbal Mount', size: 4 }, // Polaris's own remote-turret hardware
  // FTB-001E — the two salvage-head overrides formerly here ('Salvation
  // Salvage Head', 'Baler Salvage Head', each forced to category
  // 'Salvage') are gone: they existed only to compensate for the exact
  // same latent defect FTB-001D found and fixed for mining — every real
  // salvage head port's own type field was the untranslated raw
  // equipmentGroup string "Salvage" instead of the catalog's actual
  // "Salvage Module" vocabulary. Fixed at the true source
  // (src/data/shipDefinitions.ts's compatibilityTypeFor, "Salvage" ->
  // "Salvage Module") rather than patched per display name here.
  // "Missile Rack" (bare, no brand) is a genuine in-fiction factory item
  // name for L22 AlphaWolf, not a placeholder.
  'Missile Rack': { category: 'Missile Rack', size: 2 }, // L22 AlphaWolf's own rack
  // "MSD-543 Missile Rack" cannot be safely resolved with a single entry
  // at all: it is a real, distinct S1 unit on the 325a, a real, distinct S4
  // unit on the Starlancer Max/TAC family, and a real, distinct S5 unit on
  // every other ship that carries it (Hammerhead, Tiburon, Starfighter
  // Inferno/Ion, 600i family, 890Jump) — three genuinely different real
  // components sharing one display name, not a dedup mistake. Sized here
  // for the largest group (S5); every other size's own rows are the
  // documented, narrow exceptions src/data/__tests__/shipDefinitions.test.ts
  // allow-lists rather than guessing a single size that would misclassify
  // the others. Resolving this precisely would require resolving
  // components by entity-class id instead of display name — out of this
  // mission's scope ("no redesign").
  'MSD-543 Missile Rack': { category: 'Missile Rack', size: 5 },
}

/**
 * Parses a Hardpoint's `size` field (e.g. "S2") into the numeric size the
 * compatibility engine and catalog use (e.g. 2). Falls back to NaN for a
 * malformed value, which will simply never match — treated as "unknown".
 */
function parsePortSize(size: string): number {
  const match = /(\d+)/.exec(size)
  return match ? Number(match[1]) : NaN
}

export interface TargetValidation {
  valid: boolean
  message?: string
  /** EWO-STAB-004A — distinguishes a positively-confirmed mismatch from a
   * genuinely ambiguous cataloged name (Assignment 3). Absent when `valid`
   * is true. */
  reason?: 'incompatible' | 'ambiguous'
}

/**
 * EWO-STAB-004A — converts a raw canonical record into the ordinary
 * category/size decision `checkCompatibility`'s Rule C/E path uses.
 *
 * A raw DataCore category with no `CATEGORY_TO_PORT_TYPE` translation
 * (e.g. "Turret" — a mount/turret-housing row's own factory item, like
 * `Mount_Gimbal_S4`'s "VariPuck S4 Gimbal Mount", which is a structural
 * hardware label the ordinary category/size vocabulary was never meant to
 * validate) resolves `unresolved` here — exactly the pre-existing
 * "uncataloged, can't disprove compatibility" permissive behavior every
 * such row already relied on before this mission, unchanged. The ONE
 * exception is a `subtype: "PDCTurret"` record: it is always `resolved`
 * regardless of translation, because it is never evaluated through this
 * ordinary path at all — `checkCompatibility` diverts it to the
 * PDC-specific rule using `subtype` directly, before `category` is ever
 * consulted.
 */
function toCandidateResolution(record: CanonicalComponentRecord): CandidateResolution {
  if (!isPlayerSelectableRecord(record)) return { status: 'unresolved' }
  const translatedCategory = compatibilityPortTypeFor(record.category, record.subtype)
  return {
    status: 'resolved',
    entry: { category: translatedCategory ?? record.category, size: record.size, entityClass: record.entityClass, subtype: record.subtype },
  }
}

/**
 * EWO-STAB-004A (ADR-010, Assignment 9) — whether a canonical record could
 * ever be offered as a Target picker option or evaluated through the
 * ordinary compatibility path: either its raw category translates to the
 * existing port-type vocabulary, or it's a PDCTurret (evaluated by its own
 * dedicated rule, never via translation). The same gate
 * `toCandidateResolution` applies internally — exported so UI selection
 * lists (e.g. src/pages/MissionComposer.tsx's Target picker) filter
 * candidates with this one shared decision rather than a second copy.
 */
export function isPlayerSelectableRecord(record: { category: string; subtype: string | null }): boolean {
  return Boolean(compatibilityPortTypeFor(record.category, record.subtype)) || record.subtype === 'PDCTurret'
}

export type CandidateResolution =
  | { status: 'resolved'; entry: CatalogEntry }
  /** Two or more distinct real entityClasses share this display name
   * (e.g. `M2C "Swarm"`) — EWO-STAB-004A (ADR-010, Assignment 3). Never
   * resolved by picking the first, by insertion order, or by size alone. */
  | { status: 'ambiguous' }
  | { status: 'unresolved' }

/**
 * The one shared candidate-resolution decision (EWO-STAB-004A, Assignments
 * 2/3/6) — every compatibility- and identity-sensitive caller in this
 * codebase resolves a component through this function, never by reading
 * the generated catalog maps directly.
 *
 * Precedence:
 *   1. The hand-authored CATALOG override table, by name, REGARDLESS of
 *      whether an entityClass was also supplied. Every key here is a
 *      specifically-reviewed correction for a known bulk-catalog problem
 *      — not just a same-name collision, but in some cases (e.g. "Baler
 *      Salvage Head") a deliberate match to this ship-import pipeline's
 *      own quirky port-type string rather than the component's
 *      "correctly" translated category. A real entityClass's generic
 *      resolution must not silently override a human-reviewed fix.
 *   2. Without an override, `entityClass` when supplied — resolved
 *      EXACTLY via `resolveComponentByEntityClass`. Not found means
 *      `unresolved` (uncataloged) — never silently re-resolved by name;
 *      substituting a same-name component for a specific entityClass that
 *      missed is exactly what CAT-003 found causing the Polaris PDC bug.
 *   3. Without an entityClass either: the ambiguity-aware bulk catalog
 *      (`resolveComponentByName`). A name shared by two or more distinct
 *      entityClasses resolves `ambiguous`, never "first entry wins".
 */
function resolveCandidate(item: string, entityClass?: string | null): CandidateResolution {
  const override = CATALOG[item]
  if (override) return { status: 'resolved', entry: override }

  if (entityClass) {
    const resolution = resolveComponentByEntityClass(entityClass)
    return resolution.status === 'resolved' ? toCandidateResolution(resolution.record) : { status: 'unresolved' }
  }

  const resolution = resolveComponentByName(item)
  if (resolution.status === 'ambiguous') return { status: 'ambiguous' }
  if (resolution.status === 'resolved') return toCandidateResolution(resolution.record)
  return { status: 'unresolved' }
}

/**
 * EWO-STAB-003B — a public entry point onto the exact same resolution
 * chain `validateTargetCompatibility`/`isComponentSelectableForPort`
 * already use, for src/engine/installation/componentIdentityService.ts.
 * No new lookup, no new rule — this only exposes what was already being
 * computed here so the installation engine can resolve identity through
 * the one existing catalog, rather than re-deriving its own.
 *
 * EWO-STAB-004A — an ambiguous name now resolves `undefined` here (same
 * "not found" signal as a genuinely uncataloged name) rather than
 * silently returning the first candidate. A caller that must distinguish
 * "ambiguous" from "uncataloged" (identity resolution, which needs to
 * refuse ambiguity rather than treat it as permissively unknown) uses
 * `resolveComponentCatalogEntryDetailed` instead.
 */
export function resolveComponentCatalogEntry(item: string): CatalogEntry | undefined {
  const result = resolveCandidate(item)
  return result.status === 'resolved' ? result.entry : undefined
}

/** EWO-STAB-004A — the detailed form of the above, preserving the
 * ambiguous/unresolved distinction `CatalogEntry | undefined` can't
 * express. Used by componentIdentityService.ts's own name-based
 * resolution branch. */
export function resolveComponentCatalogEntryDetailed(item: string, entityClass?: string | null): CandidateResolution {
  return resolveCandidate(item, entityClass)
}

export type DestinationCapability = 'PDC_TURRET' | null

/**
 * EWO-STAB-004A (ADR-010, Assignment 4) — a native PDC-capable port's
 * destination capability, derived fresh from the hardpoint's own
 * `factoryEntityClass` every time this is called — never from what's
 * currently installed/targeted, never from ship model, display name,
 * port label text, equipment-group label, or size alone. Because
 * `factoryEntityClass` is the physical port's own permanent identity
 * (set once at import/materialization and never mutated by
 * install/remove/target-edit), this stays correct whether the factory
 * PDC is installed, removed, swapped for something else, or the
 * Commander is viewing Factory Loadout or any other Build for the same
 * physical port.
 */
export function deriveDestinationCapability(factoryEntityClass: string | null | undefined): DestinationCapability {
  if (!factoryEntityClass) return null
  const resolution = resolveComponentByEntityClass(factoryEntityClass)
  if (resolution.status === 'resolved' && resolution.record.category === 'Turret' && resolution.record.subtype === 'PDCTurret') {
    return 'PDC_TURRET'
  }
  return null
}

/** Identity hints a compatibility caller passes through when already
 * available on the hardpoint/component in question (EWO-STAB-004A,
 * Assignment 6) — never re-resolved by display name when present. */
export interface CompatibilityIdentityHint {
  /** The candidate component's own entityClass, when already known
   * (e.g. Hardpoint.targetEntityClass/factoryEntityClass). */
  itemEntityClass?: string | null
  /** The destination port's own factory-installed entityClass — the
   * input to `deriveDestinationCapability`. */
  destinationFactoryEntityClass?: string | null
}

/**
 * EWO-STAB-004A (ADR-010, Assignment 5) — implements rules A-E:
 *   A/B. A PDCTurret-subtype candidate fits ONLY a PDC_TURRET-capable
 *        destination (subject to the existing exact-size requirement
 *        every rule in this file already applies) — never an ordinary
 *        weapon/gimbal/turret destination, regardless of matching size.
 *   D.   The reverse: a monolithic PDC_TURRET destination never accepts
 *        an ordinary (non-PDCTurret) component, regardless of its own
 *        category/size.
 *   C/E. Neither side is PDC-related — the pre-existing category/size
 *        check, byte-for-byte unchanged. This is what lets an internal
 *        PDC gun (e.g. BEHR_LaserRepeater_PDC_S1, subtype "Gun") validate
 *        normally against its own ordinary weapon destination (an
 *        Idris-style captured child port) rather than being confused
 *        with the same-name S2 parent turret assembly.
 */
function checkCompatibility(entry: CatalogEntry, portType: string, portSize: string, destinationCapability: DestinationCapability): boolean {
  const size = parsePortSize(portSize)
  if (Number.isNaN(size)) return true

  if (entry.subtype === 'PDCTurret') {
    return destinationCapability === 'PDC_TURRET' && entry.size === size
  }

  if (destinationCapability === 'PDC_TURRET') {
    return false
  }

  const component: Component = {
    id: '',
    internalName: '',
    displayName: '',
    manufacturer: '',
    category: entry.category,
    subtype: entry.subtype ?? '',
    size: entry.size,
    grade: '',
    class: '',
    tags: [],
  }
  const rule: CompatibilityRule = {
    allowedTypes: [portType],
    allowedSubtypes: [],
    minSize: size,
    maxSize: size,
  }
  return isCompatible(component, rule)
}

/**
 * Validates a hardpoint's targetItem against its Port's type/size, via the
 * real compatibility engine (isCompatible). Only returns `valid: false`
 * when the item is in the catalog AND its category/size positively
 * conflicts with the port — an uncataloged item is always treated as
 * valid, since we can't disprove compatibility we have no data for.
 *
 * EWO-STAB-004A — `identity`, when supplied, is preferred over re-deriving
 * everything from `targetItem`'s display-name text (Assignment 6): a
 * known `itemEntityClass` resolves exactly; a genuinely ambiguous name
 * (no entityClass known) returns `reason: 'ambiguous'` rather than
 * guessing. `destinationFactoryEntityClass` drives the PDC-aware rules
 * above — see `deriveDestinationCapability`.
 */
export function validateTargetCompatibility(
  targetItem: string | null | undefined,
  portType: string,
  portSize: string,
  identity?: CompatibilityIdentityHint
): TargetValidation {
  const item = (targetItem ?? '').trim()
  if (!item || item === '—') return { valid: true }

  const resolution = resolveCandidate(item, identity?.itemEntityClass)
  if (resolution.status === 'ambiguous') {
    return {
      valid: false,
      reason: 'ambiguous',
      message: `"${item}" matches more than one real component in the catalog and cannot be safely validated by name alone.`,
    }
  }
  if (resolution.status === 'unresolved') return { valid: true }

  const destinationCapability = deriveDestinationCapability(identity?.destinationFactoryEntityClass)
  if (checkCompatibility(resolution.entry, portType, portSize, destinationCapability)) return { valid: true }

  return {
    valid: false,
    reason: 'incompatible',
    message: `${item} is not compatible with this ${portSize} ${portType} port.`,
  }
}

/**
 * EWO-024 (Task 2) — "the Commander should not be able to choose obviously
 * incompatible equipment through normal UI interaction." Used to filter
 * the Target picker's suggestion list down to components that are not
 * POSITIVELY known to be incompatible with a given port — an uncataloged
 * component is still shown (same "never disprove compatibility we have no
 * data for" philosophy `validateTargetCompatibility` already applies), so
 * this never hides a legitimate but uncataloged choice. Free-text entry
 * and full compatibility re-validation both remain unchanged — this only
 * narrows what's SUGGESTED, never what CAN be typed or saved.
 *
 * EWO-STAB-004A — an ambiguous name is never suggested (Assignment 9):
 * offering it would mean picking one of several real components with no
 * way to know which the Commander actually means.
 */
export function isComponentSelectableForPort(item: string, portType: string, portSize: string, identity?: CompatibilityIdentityHint): boolean {
  const resolution = resolveCandidate(item, identity?.itemEntityClass)
  if (resolution.status === 'ambiguous') return false
  if (resolution.status === 'unresolved') return true
  const destinationCapability = deriveDestinationCapability(identity?.destinationFactoryEntityClass)
  return checkCompatibility(resolution.entry, portType, portSize, destinationCapability)
}
