import { componentByDisplayName } from '../generated/importedShips'
import { catalogComponentsByEntityClass, catalogComponentsByName } from '../generated/componentCatalog'

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
   * "Military A", "Military", "Grade A"), produced by the single shared
   * `formatComponentClassGrade()` helper below so every surface that
   * shows this secondary line (Factory/Installed/Target columns, the
   * Target picker, catalog search) can never drift out of sync with each
   * other's formatting rules. Null whenever neither Class nor Grade is
   * available. See `formatComponentClassGrade`'s own doc comment for the
   * exact precedence. */
  classificationLabel: string | null
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
    return { primaryLabel: rawValue ?? '—', classificationLabel: null, diagnosticInternalName: null }
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
    return {
      primaryLabel,
      // catalogComponentsByEntityClass (CatalogPresentationEntry) carries
      // no class field — the bulk M-012 catalog never resolved one either
      // (see EWO-024 report) — so this can only ever come from the
      // per-ship Component record itself.
      classificationLabel: formatComponentClassGrade(component.class, gradeToLetter(grade)),
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
  const catalogOnlyClassificationLabel = formatComponentClassGrade(null, gradeToLetter(catalogOnly?.grade ?? null))

  if (looksRaw(rawValue)) {
    return { primaryLabel: cleanInternalName(rawValue), classificationLabel: catalogOnlyClassificationLabel, diagnosticInternalName: rawValue }
  }
  return { primaryLabel: rawValue, classificationLabel: catalogOnlyClassificationLabel, diagnosticInternalName: null }
}
