import { componentByDisplayName } from '../generated/importedShips'
import { catalogComponentsByEntityClass, catalogComponentsByName, componentsByEntityClass } from '../generated/componentCatalog'
import { componentOwnedChildSlotSpec } from './componentOwnedSlots'

/**
 * EWO-019A — Commander-readable component presentation. Pure, presentation-
 * only: given whatever string is already stored in a Hardpoint's
 * factoryItem/installedItem/targetItem field, resolves the best available
 * player-facing label plus a class/grade secondary line, without touching
 * source data, assignment identity, compatibility, readiness, or
 * persistence. See docs/UI_ARCHITECTURE.md's "Component presentation
 * contract" section for the full field-priority/formatting rules this
 * implements.
 */
export interface ComponentLabel {
  primaryLabel: string
  /** EWO-036B (Task 3) — the compact, combined Class+Grade subtitle (e.g.
   * "Military A", "Military", "Grade A"), produced by
   * `formatComponentClassGrade()` below. CAT-001 retired every consumer
   * of this field except MissionComposer's own Target picker (which keeps
   * its pre-existing compact grammar, including the word "Grade" — a
   * deliberate, still-current divergence from `identityLine`'s newer
   * grammar, not an oversight) — every other surface (Factory/Installed/
   * Target columns, Ship Workspace's New Target picker) now reads
   * `identityLine` instead. Null whenever neither Class nor Grade is
   * available. See `formatComponentClassGrade`'s own doc comment for the
   * exact precedence. */
  classificationLabel: string | null
  /** SW-008A Revision 3, regrammared for Core Components by CAT-001 — the
   * one shared, category-aware identity line, produced by
   * `formatComponentIdentity()` below. This is the secondary line every
   * Loadout Tree surface (Ship Detail, Manage Loadout, Change Installed
   * Components) renders via `ComponentAssignmentLabel`, and the fuller
   * breakdown Ship Workspace's New Target picker opts into
   * (`showFullIdentity`) — the same component always produces the exact
   * same string regardless of which of those surfaces asks. Grammar
   * varies by component family (Core/Weapon/Missile/Missile Rack/Utility
   * — see `formatComponentIdentity`'s own doc comment); nothing is ever
   * fabricated — a family whose preferred metadata doesn't exist (Weapon
   * Class, Missile Seeker Type — both audited and confirmed absent from
   * this app's entire data pipeline in SW-008A Rev 3) degrades to the next
   * most authoritative real value, never a guess. Null when there is
   * nothing at all to show. */
  identityLine: string | null
  /** Raw CIG internal identifier, for a title/tooltip attribute — null when no real identifier could be resolved (e.g. an already-readable seed value, or an explicit "nothing assigned" sentinel). */
  diagnosticInternalName: string | null
}

/** DataCore's SItemDefinition.Grade is a plain integer; the in-game/Erkul/
 * SPPV convention (and this repo's own Component.grade doc comment, "e.g.
 * 'A', 'B', 'C'") displays it as a letter. Converting 2 -> "Grade B" is
 * normalizing an already-resolved value's display form, not inventing a
 * classification — but only for the recognized 1-4 range; anything else is
 * left unconverted rather than guessed. */
const GRADE_LETTERS: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' }

function gradeToLetter(grade: string | number | null | undefined): string | null {
  if (grade === null || grade === undefined) return null
  const key = String(grade).trim()
  if (!key) return null
  if (GRADE_LETTERS[key]) return GRADE_LETTERS[key]
  if (/^[A-D]$/i.test(key)) return key.toUpperCase()
  return null
}

const EMPTY_SENTINELS = new Set(['—', '-', '', 'Unknown Factory Item', 'Unknown'])

/** Shaped like a raw StarBreaker/DataCore internal identifier — an
 * uppercase-led token chain joined by underscores (e.g.
 * "POWR_TYDT_S01_DeltaMax_SCItem"). Used to decide whether an unmatched
 * string is worth cleaning at all, so an already-readable value (a seed
 * ship's hand-authored "Slipstream", or the app's own "—"/"Unknown Factory
 * Item" sentinels) is never mangled. */
const RAW_IDENTIFIER_PATTERN = /^[A-Z0-9]+(_[A-Za-z0-9]+)+$/

function looksRaw(value: string): boolean {
  return RAW_IDENTIFIER_PATTERN.test(value) || RAW_IDENTIFIER_PATTERN.test(value.replace(/ /g, '_'))
}

/**
 * Best-effort cleanup of a raw internal identifier: drops a trailing
 * "_SCItem" suffix, a leading all-caps category-code token (POWR, SHLD,
 * COOL, ...), and any bare size token (S1, S01, ...), then space-joins
 * what remains. Conservative by design — if stripping would leave nothing,
 * the original string is returned rather than an empty label.
 */
function cleanInternalName(raw: string): string {
  const withoutSuffix = raw.replace(/_SCItem$/i, '')
  const tokens = withoutSuffix.split('_').filter(Boolean)
  if (tokens.length === 0) return raw
  const withoutCategory = tokens.length > 1 && /^[A-Z0-9]{2,6}$/.test(tokens[0]) ? tokens.slice(1) : tokens
  const withoutSize = withoutCategory.filter((t) => !/^S\d{1,2}$/i.test(t))
  const finalTokens = withoutSize.length > 0 ? withoutSize : withoutCategory
  return finalTokens.length > 0 ? finalTokens.join(' ') : raw
}

/**
 * EWO-036B (Task 3/5) — the one centralized helper for the compact
 * Class+Grade subtitle every component-presentation surface shares
 * (Factory/Installed/Target columns via `ComponentAssignmentLabel`, the
 * Target picker's committed-value and dropdown-option metadata, and
 * catalog search). Never invents a Class from a manufacturer, component
 * name, or port type — takes only the real, already-resolved values a
 * caller already has in hand.
 *
 * Precedence:
 *   1. Class and Grade both available -> "{Class} {GradeLetter}" (e.g. "Military A")
 *   2. Class only -> "{Class}" (e.g. "Military")
 *   3. Grade only -> "Grade {GradeLetter}" (e.g. "Grade A")
 *   4. neither -> null (no subtitle rendered at all)
 */
export function formatComponentClassGrade(componentClass: string | null | undefined, gradeLetter: string | null | undefined): string | null {
  const trimmedClass = componentClass && componentClass.trim() ? componentClass.trim() : null
  const trimmedGrade = gradeLetter && gradeLetter.trim() ? gradeLetter.trim() : null

  if (trimmedClass && trimmedGrade) return `${trimmedClass} ${trimmedGrade}`
  if (trimmedClass) return trimmedClass
  if (trimmedGrade) return `Grade ${trimmedGrade}`
  return null
}

/**
 * CAT-001 (Objective 7) — Core Components' identity grammar, superseding
 * SW-008A Revision 2/3's "{Size} · {Class} · Grade {Letter}" line (now
 * explicitly rejected by the Chief Architect: no Size, and the literal
 * word "Grade" must never appear). CAT-001's own catalog-generation work
 * makes real Classification data available for the first time (see
 * descriptionClassification.ts) — "{Class} {GradeLetter}" (e.g. "Stealth
 * A", real generated data for the Mirage shield). Class is never
 * fabricated from a name, manufacturer, or port type — omitted entirely
 * whenever the caller has no real Class to pass in (most Core Components
 * still have none: only Cooler/PowerPlant/QuantumDrive/Shield/Radar
 * records with real description text carry one). The honest fallback for
 * that case is the bare grade letter alone, with no other text — never
 * "Grade {Letter}", since CAT-001 forbids that word unconditionally.
 */
export function formatCoreComponentIdentity(componentClass: string | null | undefined, gradeLetter: string | null | undefined): string | null {
  const trimmedClass = componentClass && componentClass.trim() ? componentClass.trim() : null
  const trimmedGrade = gradeLetter && gradeLetter.trim() ? gradeLetter.trim() : null

  if (trimmedClass && trimmedGrade) return `${trimmedClass} ${trimmedGrade}`
  if (trimmedClass) return trimmedClass
  if (trimmedGrade) return trimmedGrade
  return null
}

/**
 * SW-008A Revision 3 — "one universal metadata line is architecturally
 * incorrect": different component families answer "what is this, and why
 * would I choose it?" with different metadata. `identityFamilyForCategory`
 * maps a real catalog `category` (DataCore's own Type, verbatim) to the
 * grammar that applies to it; a category this table has never seen falls
 * through to the safe universal default — the Core Components grammar
 * (Size/Class/Grade) — rather than guessing a new one.
 *
 * Family assignments, per the real category taxonomy audited for this
 * mission (`generated-data/component-metadata-catalog.json`):
 *   - core: Cooler, PowerPlant, QuantumDrive, Shield, Radar,
 *     LifeSupportGenerator (Jump Modules have no distinct category of
 *     their own in real data — they inherit the QuantumDrive family
 *     they're always paired with).
 *   - weapon: WeaponGun (pilot/turret/remote weapon guns — the mount
 *     assembly, tracked separately via assemblyRole, never changes which
 *     grammar the gun ITSELF uses).
 *   - missile: Missile (the projectile itself, never the rack).
 *   - missileRack: MissileLauncher.
 *   - utility: SalvageHead, SalvageModifier, TractorBeam, TowingBeam,
 *     MiningModifier, WeaponMining (mining lasers — grouped here, not with
 *     `weapon`, because the concrete worked example this mission specified
 *     — "Lancet / S2 · Mining Laser" — is a Utility-grammar line, and no
 *     real "Salvage Weapon" category exists to occupy that slot).
 */
type ComponentIdentityFamily = 'core' | 'weapon' | 'missile' | 'missileRack' | 'utility'

const IDENTITY_FAMILY_BY_CATEGORY: Record<string, ComponentIdentityFamily> = {
  Cooler: 'core',
  PowerPlant: 'core',
  QuantumDrive: 'core',
  Shield: 'core',
  Radar: 'core',
  LifeSupportGenerator: 'core',
  WeaponGun: 'weapon',
  Missile: 'missile',
  MissileLauncher: 'missileRack',
  SalvageHead: 'utility',
  SalvageModifier: 'utility',
  TractorBeam: 'utility',
  TowingBeam: 'utility',
  MiningModifier: 'utility',
  WeaponMining: 'utility',
}

function identityFamilyForCategory(category: string | null | undefined): ComponentIdentityFamily {
  return (category && IDENTITY_FAMILY_BY_CATEGORY[category]) || 'core'
}

/**
 * Weapons — CAT-002. SW-008A Rev 3's audit correctly found no *structured*
 * field carries Weapon Type (Ballistic Cannon/Laser Gatling/...) anywhere
 * in this app's data; CAT-001's Component Classification Extraction work
 * later found the same localized-description-header mechanism it built
 * for Core Components' "Class" line also carries a weapon's specific type
 * under a differently-named label CIG's own template uses ("Item Type" —
 * confirmed live: `BEHR_BallisticCannon_S4`'s description resolves to
 * `Item Type: Ballistic Cannon`, no "Class" line at all). CAT-002 wires
 * that same generator-time-extracted value through as `componentClass`
 * here — genuinely sourced from CIG's own text, never inferred from a
 * name. Size is deliberately dropped (redundant with the port itself,
 * per CAT-002's own finding); the honest fallback when no value was
 * extracted is null, never a re-introduced Size label.
 */
function formatWeaponIdentity(componentClass: string | null | undefined): string | null {
  return componentClass && componentClass.trim() ? componentClass.trim() : null
}

/**
 * Missiles — CAT-002. SW-008A Rev 3 found the real seeker/guidance type
 * (Electromagnetic/Infrared/Cross Section) only as an `_EM_`/`_IR_`/`_CS_`
 * token embedded inside `entityClass`, and declined to parse it from an
 * internal identifier. CAT-001's description-header mechanism carries the
 * same information as real CIG-authored text under the label "Tracking
 * Signal" (confirmed live for both ordinary missiles and Torpedoes, e.g.
 * `MISL_S01_EM_THCN_TaskForce` -> `Tracking Signal: Electromagnetic`,
 * `MISL_S10_IR_BEHR_Torpedo` -> `Tracking Signal: Infrared`) — CAT-002
 * wires that generator-time-extracted value through as `componentClass`.
 * Size and the old bare "Torpedo" subtype suffix are both dropped in
 * favor of this more specific, genuinely differentiating signal; honest
 * fallback when unavailable is null.
 */
function formatMissileIdentity(componentClass: string | null | undefined): string | null {
  return componentClass && componentClass.trim() ? componentClass.trim() : null
}

/**
 * Missile Racks — the one family with fully authoritative data: capacity
 * (slot count + accepted missile size) is the exact same real, generated
 * `component-owned-slot spec` (`componentOwnedChildSlotSpec`, keyed by the
 * rack's own entityClass) missile rack aggregation already uses elsewhere
 * in this app (SW-007D) — never re-derived or guessed here.
 */
function formatMissileRackIdentity(sizeLabel: string | null, entityClass: string | null | undefined): string | null {
  const segments: string[] = []
  if (sizeLabel) segments.push(sizeLabel)
  const spec = entityClass ? componentOwnedChildSlotSpec(entityClass) : null
  if (spec && spec.label === 'Missile' && spec.size) segments.push(`${spec.count} × S${spec.size} Missiles`)
  return segments.length > 0 ? segments.join(' · ') : null
}

/**
 * Utility components — no `subtype` field distinguishes Salvage Head from
 * Salvage Modifier from Tractor Beam from Mining Laser (SW-008A Rev 3
 * audit: `subtype` is null or uninformative across all of these real
 * categories); the real, authoritative distinguishing signal is the
 * `category` field itself, which this table translates to the same plain
 * words the Chief Architect's own worked examples use. This is a
 * presentation-identity mapping, deliberately separate from
 * `CATEGORY_TO_PORT_TYPE` (`src/generated/componentCatalog.ts`) — that
 * table exists for PORT-COMPATIBILITY grouping and deliberately collapses
 * TractorBeam/TowingBeam into the coarser "Utility" port-type bucket
 * (FTB-001E/FTB-001F: scraper/tractor modifiers are interchangeable
 * between sockets); this mission only changes what a Commander is TOLD a
 * component IS, never what a port ACCEPTS, so reusing that table here
 * would be wrong for identity purposes even though it's correct for
 * compatibility purposes.
 *
 * One real, authoritative `subtype` distinction survives this collapse and
 * is worth surfacing for identity even though FTB-001E/F correctly ignore
 * it for compatibility: 2 of 9 real `SalvageModifier` records carry
 * `subtype: 'SalvageModifier_TractorBeam'` (e.g. "ReadyGrip Tractor
 * Module") — a genuinely different, real signal from the 7 scraper-style
 * SalvageModifier records (`subtype: null`), so those two display "Tractor
 * Beam" rather than the generic "Salvage Modifier".
 */
const UTILITY_CATEGORY_LABEL: Record<string, string> = {
  SalvageHead: 'Salvage Head',
  SalvageModifier: 'Salvage Modifier',
  TractorBeam: 'Tractor Beam',
  TowingBeam: 'Tractor Beam',
  MiningModifier: 'Mining Module',
  WeaponMining: 'Mining Laser',
}

function formatUtilityIdentity(sizeLabel: string | null, category: string | null | undefined, subtype: string | null | undefined): string | null {
  const segments: string[] = []
  if (sizeLabel) segments.push(sizeLabel)
  const label = category === 'SalvageModifier' && subtype === 'SalvageModifier_TractorBeam' ? 'Tractor Beam' : category ? UTILITY_CATEGORY_LABEL[category] : undefined
  if (label) segments.push(label)
  return segments.length > 0 ? segments.join(' · ') : null
}

/**
 * SW-008A Revision 3 — the one shared authority every consumer of the
 * fuller identity line goes through; a presentation page never decides
 * for itself whether Grade, Weapon Class, Missile Guidance, or Rack
 * Capacity appears — this function does, based solely on the component's
 * own real `category`. See `identityFamilyForCategory`'s own doc comment
 * for the full family list and reasoning.
 */
export function formatComponentIdentity(params: {
  sizeLabel: string | null
  componentClass: string | null | undefined
  gradeLetter: string | null | undefined
  category: string | null | undefined
  subtype: string | null | undefined
  entityClass: string | null | undefined
}): string | null {
  switch (identityFamilyForCategory(params.category)) {
    case 'weapon':
      return formatWeaponIdentity(params.componentClass)
    case 'missile':
      return formatMissileIdentity(params.componentClass)
    case 'missileRack':
      return formatMissileRackIdentity(params.sizeLabel, params.entityClass)
    case 'utility':
      return formatUtilityIdentity(params.sizeLabel, params.category, params.subtype)
    case 'core':
    default:
      return formatCoreComponentIdentity(params.componentClass, params.gradeLetter)
  }
}

/**
 * Resolves a Commander-facing label for whatever value is currently stored
 * in a Hardpoint's factoryItem/installedItem/targetItem field.
 *
 * Field-priority resolution order:
 *   1. the Mission M-012 bulk catalog's real localized display name
 *      (component-metadata-catalog.json, via catalogComponentsByEntityClass) —
 *      joined via the exact internalName recovered in step 0, never guessed;
 *   2. the deep-import pipeline's own resolved Component.displayName,
 *      when it is not itself raw-identifier-shaped;
 *   3. a cleaned internal name, when the value (matched or unmatched)
 *      looks like a raw internal identifier;
 *   4. the original string, unchanged — covers hand-authored seed values
 *      (already readable) and explicit "nothing assigned" sentinels.
 */
export function resolveComponentLabel(rawValue: string | null | undefined): ComponentLabel {
  if (!rawValue || EMPTY_SENTINELS.has(rawValue)) {
    return { primaryLabel: rawValue ?? '—', classificationLabel: null, identityLine: null, diagnosticInternalName: null }
  }

  // Step 0: exact, non-guessed join back to the deep-import's own record —
  // Hardpoint.factoryItem/installedItem/targetItem are plain strings, but
  // they were copied verbatim from Component.displayName at materialization
  // time (see src/data/shipDefinitions.ts's factoryItemFor / ShipDetail's
  // ImportedShipDetail nameFor), so this lookup is exact, not reconstructed.
  const component = componentByDisplayName.get(rawValue)
  if (component) {
    const catalogEntry = catalogComponentsByEntityClass.get(component.internalName)
    const primaryLabel = catalogEntry?.displayName ?? (looksRaw(component.displayName) ? cleanInternalName(component.internalName) : component.displayName)
    const grade = catalogEntry?.grade ?? component.grade
    const gradeLetter = gradeToLetter(grade)
    // component.size is always a real number on this record (the deep-
    // import normalizer never leaves it unset) — the bulk catalog carries
    // no size on CatalogPresentationEntry, so this is the one source.
    const sizeLabel = component.size ? `S${component.size}` : null
    // CAT-001 — catalogComponentsByEntityClass now carries a real,
    // generated Classification (see descriptionClassification.ts),
    // preferred the same way `grade` above already prefers the catalog's
    // value over the per-ship deep-import record's own (historically
    // always-empty) `class` field.
    const componentClass = catalogEntry?.classification ?? component.class
    return {
      primaryLabel,
      classificationLabel: formatComponentClassGrade(componentClass, gradeLetter),
      identityLine: formatComponentIdentity({
        sizeLabel,
        componentClass,
        gradeLetter,
        category: component.category,
        subtype: component.subtype,
        entityClass: component.internalName,
      }),
      diagnosticInternalName: component.internalName,
    }
  }

  // No per-ship deep-import instance matched — the overwhelming majority
  // of the bulk M-012 catalog's ~679 selectable components, since only a
  // handful of ships are deep-imported and componentByDisplayName only
  // ever contains a name that some deep-imported ship actually assigned
  // to a port. This used to mean Grade was unreachable for every one of
  // those catalog-only names even though the same generated-data record
  // already carries a real grade value (see EWO-026 report: 679/679
  // selectable components have one) — catalogComponentsByName now carries
  // it through by the same display name this function already has in hand.
  // No class field exists on this catalog-only entry either (same EWO-024
  // gap as above), so classificationLabel here can only ever be a bare
  // "Grade X" (precedence tier 3) or null — never a fabricated Class.
  const catalogOnly = catalogComponentsByName.get(rawValue)
  const catalogOnlyGradeLetter = gradeToLetter(catalogOnly?.grade ?? null)
  // SW-008A Revision 3 — CatalogComponentEntry.category is already
  // translated to the coarser port-compatibility vocabulary ('Utility',
  // 'Weapon', ...) by CATEGORY_TO_PORT_TYPE at build time, and it has no
  // `subtype` of its own — neither is usable for family/utility-label
  // detection here. `componentsByEntityClass` (CanonicalComponentRecord,
  // the same map `fullComponentCatalog.ts`'s option list is built from)
  // carries the real, RAW DataCore category and subtype for the exact same
  // entityClass this record was built from — reused here, never a second
  // data source, and the one that actually matches `IDENTITY_FAMILY_BY_CATEGORY`'s
  // keys. CAT-001 — it also now carries the real generated Classification.
  const canonicalRecord = catalogOnly ? componentsByEntityClass.get(catalogOnly.entityClass) : undefined
  const catalogOnlyClassificationLabel = formatComponentClassGrade(canonicalRecord?.classification ?? null, catalogOnlyGradeLetter)
  // CatalogComponentEntry (catalogComponentsByName) carries a real size —
  // unlike CatalogPresentationEntry above, this map was built for exactly
  // this kind of full-identity lookup (see EWO-STAB-004A).
  const catalogOnlySizeLabel = catalogOnly?.size ? `S${catalogOnly.size}` : null
  const catalogOnlyIdentityLine = formatComponentIdentity({
    sizeLabel: catalogOnlySizeLabel,
    componentClass: canonicalRecord?.classification ?? null,
    gradeLetter: catalogOnlyGradeLetter,
    category: canonicalRecord?.category,
    subtype: canonicalRecord?.subtype,
    entityClass: catalogOnly?.entityClass,
  })

  if (looksRaw(rawValue)) {
    return { primaryLabel: cleanInternalName(rawValue), classificationLabel: catalogOnlyClassificationLabel, identityLine: catalogOnlyIdentityLine, diagnosticInternalName: rawValue }
  }
  return { primaryLabel: rawValue, classificationLabel: catalogOnlyClassificationLabel, identityLine: catalogOnlyIdentityLine, diagnosticInternalName: null }
}
