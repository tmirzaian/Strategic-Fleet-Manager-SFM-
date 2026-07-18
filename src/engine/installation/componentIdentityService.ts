import { resolveComponentCatalogEntry } from '../../data/componentCatalog'
import { catalogComponentsByEntityClass } from '../../generated/componentCatalog'
import type { ComponentReference } from './types'

/**
 * EWO-STAB-003B — the canonical component identity resolver
 * (EWO-STAB-003A §2). No caller outside the installation engine resolves
 * component identity directly; every operation passes through here first.
 *
 * Primary identity: `entityClass` (stable, DataCore-sourced). Secondary:
 * `displayName`, used only for presentation and for resolving a
 * Commander's typed/selected name back to an entityClass at the boundary.
 * Legacy fallback: a component with no resolvable entityClass keeps
 * matching by name alone — this is not new behavior, it is the same
 * fallback `resolveCatalogEntry`/`isComponentSelectableForPort` already
 * apply everywhere else in this codebase, now applied consistently here
 * too. Nothing is fabricated: a lookup that finds nothing returns `null`
 * fields, never a guess.
 *
 * "Resolve aliases" (EWO-STAB-003A §2) is fulfilled by reusing the
 * existing hand-authored CATALOG override table in
 * src/data/componentCatalog.ts (via resolveComponentCatalogEntry) — the
 * mechanism that already corrects cases like Slipstream/Snowblind/FR-86
 * where the bulk generated catalog would otherwise resolve incorrectly.
 * No new alias table is introduced (out of scope — EWO-STAB-003B forbids
 * new compatibility restrictions, and this is the same principle applied
 * to identity).
 *
 * Known, pre-existing, and deliberately NOT fixed here (matches
 * EWO-STAB-001's Finding 4 and componentCatalog.ts's own documented
 * limitation): when two real, differently-sized components share a
 * display name, resolving from an entityClass and round-tripping back to
 * category/size via that name can land on the wrong one. This is not a
 * new gap — it already exists in the current catalog/override
 * architecture — and fixing it would mean changing which category/size a
 * name resolves to, which is a compatibility-rule change explicitly out
 * of scope for this mission.
 */
export interface ResolvedComponentIdentity {
  /** Normalized (trimmed) display name — never empty when resolution
   * succeeds; the em-dash "no item" sentinel resolves to a null identity
   * instead (see resolveComponentIdentity's guard below). */
  displayName: string
  /** null when uncataloged, or when only reachable via the hand-authored
   * override table (which carries no entityClass — see CatalogEntry in
   * componentCatalog.ts). Never a guess. */
  entityClass: string | null
  category: string | null
  size: number | null
}

const NO_ITEM_SENTINEL = '—'

/** Resolves a ComponentReference to its canonical identity. Returns `null`
 * only for the two cases that mean "no component at all" — an empty
 * string or the existing '—' sentinel already used throughout Hardpoint
 * data (src/data/componentCatalog.ts's validateTargetCompatibility uses
 * the same guard) — never for a genuinely unknown name, which resolves
 * with `entityClass`/`category`/`size` all null instead. */
export function resolveComponentIdentity(reference: ComponentReference): ResolvedComponentIdentity | null {
  if ('hangarItemId' in reference) {
    // The engine always supplies the resolved HangarItem's own name/entityClass
    // via the displayName/entityClass branches below — see installationEngine.ts,
    // which looks the record up from the state snapshot before calling this
    // function. This branch exists only so ComponentReference's shape stays a
    // closed union; it is never constructed by a caller directly.
    throw new Error('resolveComponentIdentity: hangarItemId must be resolved to a displayName/entityClass by the caller first.')
  }

  if ('entityClass' in reference) {
    const presentation = catalogComponentsByEntityClass.get(reference.entityClass)
    if (!presentation) {
      // A caller-supplied entityClass with no catalog presentation is a
      // caller error, not an "uncataloged component" — there is no
      // legacy fallback for this shape (unlike a plain typed name, an
      // entityClass is never something a Commander could have typed by
      // hand), so this resolves to nothing rather than guessing a name.
      return null
    }
    const entry = resolveComponentCatalogEntry(presentation.displayName)
    return {
      displayName: presentation.displayName,
      entityClass: reference.entityClass,
      category: entry?.category ?? null,
      size: entry?.size ?? null,
    }
  }

  const trimmed = reference.displayName.trim()
  if (!trimmed || trimmed === NO_ITEM_SENTINEL) return null

  const entry = resolveComponentCatalogEntry(trimmed)
  return {
    displayName: trimmed,
    entityClass: entry?.entityClass ?? null,
    category: entry?.category ?? null,
    size: entry?.size ?? null,
  }
}
