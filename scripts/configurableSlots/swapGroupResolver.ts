/**
 * SW-010A (Objective 2) — Swap Group Resolver.
 *
 * Implements SwapGroupSpecification.md's resolution algorithm exactly:
 * discovery, grouping, normalization (verbatim, no case-folding, no `$`
 * stripping — the real `ANVL_Hornet_Center` group has no `$` prefix at
 * all), the "relevant tag" filter, lookup, validation, conflict
 * detection, duplicate handling, single-member handling, and
 * unknown-family behavior.
 *
 * Entirely data-driven: every function here takes already-fetched data
 * (a `Map<entityClass, rawTagsString>`) and a set of default entity
 * classes to resolve against it — nothing here reads a ship id, hull
 * name, or manufacturer string. The live bulk `dcb query` for
 * `AttachDef.Tags` is the caller's responsibility (see
 * `scripts/generateConfigurableSlotReport.ts`), exactly like every other
 * pure/IO split in this codebase's generator scripts.
 */
import type { SlotDiagnostic, SwapGroup } from './types'

/** Splits one entity's raw `AttachDef.Tags` string into individual
 * whitespace-separated tokens — SwapGroupSpecification.md's discovery
 * step. No filtering here: an ordinary descriptive tag (`flightReady`,
 * a manufacturer code) is structurally indistinguishable from a genuine
 * swap-group tag until the "relevant tag" filter (step 4) is applied. */
function tokenize(tags: string): string[] {
  return tags.split(/\s+/).filter(Boolean)
}

/**
 * Builds the global `tag -> entityClass[]` index over every entity's
 * tags — built once per catalog-generation run, never per ship (the same
 * discipline `docs/ImportPipeline.md`'s Mission M-012/FTB-001F Part C
 * notes already established for bulk field queries).
 */
export function buildGlobalTagIndex(tagsByEntityClass: Map<string, string>): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const [entityClass, tags] of tagsByEntityClass) {
    for (const token of tokenize(tags)) {
      const existing = index.get(token)
      if (existing) {
        if (!existing.includes(entityClass)) existing.push(entityClass)
      } else {
        index.set(token, [entityClass])
      }
    }
  }
  return index
}

/**
 * Step 4 — the actual filter. A tag is "relevant" to this specific
 * default component only when: (a) the default component itself carries
 * the tag, and (b) at least one OTHER entity in the global index shares
 * it. Never "does this tag look important" — always "is this the tag on
 * a confirmed slot's own default item, shared with something else."
 *
 * Deterministic when a default carries more than one qualifying tag: the
 * candidate with the SMALLEST global membership wins, not the first one
 * in raw Tags string order. Live-proven necessary during SW-010A
 * Objective 6 validation — `UMNT_ANVL_S5_Cap_Mk2`'s real Tags string is
 * `"flightReady $ANVL_Hornet_Mk2_Center"`. `flightReady` is a generic
 * operational-status tag shared by 1,731 unrelated entities fleet-wide
 * (turrets, seat-access points, self-destruct devices, fuel pods — not a
 * swap group by any definition), while `$ANVL_Hornet_Mk2_Center` is the
 * real, narrowly-scoped swap-group tag confirmed live during SW-008C
 * Revision 1 Phase 2. A "first token wins" rule silently picked the
 * former every time, because DataCore happens to list the generic tag
 * first. A genuine swap-group tag is inherently purpose-built and small;
 * a tag shared by hundreds of unrelated entities is definitionally not
 * one. Smallest-membership is therefore the principled, data-driven
 * tie-break — not a hand-tuned exception for `flightReady` specifically.
 * Ties (equal smallest membership) fall back to raw Tags string order,
 * recorded as a diagnostic so a genuinely ambiguous default is never
 * silently resolved either way.
 */
function findRelevantTag(defaultEntityClass: string, tagsByEntityClass: Map<string, string>, globalIndex: Map<string, string[]>): { tag: string; diagnostics: SlotDiagnostic[] } | null {
  const rawTags = tagsByEntityClass.get(defaultEntityClass)
  if (!rawTags) return null
  const candidates = tokenize(rawTags).filter((token) => (globalIndex.get(token)?.length ?? 0) > 1)
  if (candidates.length === 0) return null

  const bySize = [...candidates].sort((a, b) => (globalIndex.get(a)?.length ?? 0) - (globalIndex.get(b)?.length ?? 0))
  const smallestSize = globalIndex.get(bySize[0])?.length ?? 0
  const winner = bySize[0]

  const diagnostics: SlotDiagnostic[] = []
  if (candidates.length > 1) {
    const tiedForSmallest = bySize.filter((tag) => (globalIndex.get(tag)?.length ?? 0) === smallestSize)
    diagnostics.push({
      code: 'swap-group-shared-across-slots',
      message:
        tiedForSmallest.length > 1
          ? `Default component "${defaultEntityClass}" carries multiple qualifying tags tied at the smallest global membership (${tiedForSmallest.join(', ')}, ${smallestSize} members each) — using "${winner}" (first in raw Tags order among the tied candidates); the others are not evaluated.`
          : `Default component "${defaultEntityClass}" carries more than one multi-member tag (${candidates.map((t) => `${t}:${globalIndex.get(t)?.length ?? 0}`).join(', ')}) — using "${winner}" (smallest global membership); the others are not evaluated.`,
      severity: 'warning',
    })
  }
  return { tag: winner, diagnostics }
}

export interface SwapGroupResolutionInput {
  /** The entity class currently the factory default for the slot being resolved. */
  defaultEntityClass: string
  /** Every entity class SFM's own catalog currently recognizes — used only for step 7's existence cross-check, never for discovery itself. */
  knownCatalogEntityClasses: Set<string>
}

/**
 * Resolves one Configurable Slot's swap group from its default
 * component's tags. Returns `null` only when the default has no
 * qualifying tag at all — the caller (Stage 9 merge / ConfigurableSlot
 * construction) is responsible for turning that into the
 * `confidence: 'unresolved'` / `swap-group-unknown-family` outcome
 * (SwapGroupSpecification.md §11); this function's job is resolution,
 * not the slot's own final shape.
 */
export function resolveSwapGroup(input: SwapGroupResolutionInput, tagsByEntityClass: Map<string, string>, globalIndex: Map<string, string[]>): SwapGroup | null {
  const relevant = findRelevantTag(input.defaultEntityClass, tagsByEntityClass, globalIndex)
  if (!relevant) return null

  const diagnostics: SlotDiagnostic[] = [...relevant.diagnostics]
  const rawMembers = globalIndex.get(relevant.tag) ?? []

  // Step 9 — duplicate handling: dedupe by entity class (buildGlobalTagIndex
  // already guards this, but defensive here too — never trust a single
  // layer for an identity guarantee this important).
  const seen = new Set<string>()
  const eligibleComponents: string[] = []
  for (const entityClass of rawMembers) {
    if (seen.has(entityClass)) {
      diagnostics.push({ code: 'swap-group-duplicate-member', message: `"${entityClass}" appeared more than once for tag "${relevant.tag}" — deduplicated.`, severity: 'warning' })
      continue
    }
    seen.add(entityClass)
    // Step 7 — existence cross-check: a member that no longer resolves
    // in the current catalog is excluded, never included as a dead
    // reference.
    if (!input.knownCatalogEntityClasses.has(entityClass)) {
      diagnostics.push({ code: 'swap-group-unresolved-reference', message: `"${entityClass}" shares tag "${relevant.tag}" but is not a currently-cataloged entity — excluded from the eligible set.`, severity: 'warning' })
      continue
    }
    eligibleComponents.push(entityClass)
  }

  // Step 7 — the default must always be a member of its own eligible set.
  if (!eligibleComponents.includes(input.defaultEntityClass)) {
    diagnostics.push({
      code: 'swap-group-default-not-self-member',
      message: `Default component "${input.defaultEntityClass}" is not present in its own resolved eligible set for tag "${relevant.tag}" — treating this group as unresolved.`,
      severity: 'warning',
    })
    return { swapGroupId: relevant.tag, eligibleComponents: [], confidence: 'unresolved', diagnostics }
  }

  // Step 10 — single-member handling: real slot, real tag, no
  // alternative currently captured — informational, not an error.
  if (eligibleComponents.length === 1) {
    diagnostics.push({ code: 'swap-group-single-member', message: `Tag "${relevant.tag}" resolves to exactly one member (the default itself) — no alternative currently captured in the catalog.`, severity: 'info' })
  } else {
    diagnostics.push({ code: 'swap-group-resolved', message: `Tag "${relevant.tag}" resolved to ${eligibleComponents.length} eligible components.`, severity: 'info' })
  }

  // Phase I never proves a port-side declaration (ADR-014 R-001/R-003) —
  // every real resolution this pipeline can produce today is
  // tag-co-membership. `confirmed-bidirectional` is reachable only once a
  // future phase adds a port-side authority; the type exists now so that
  // promotion never requires a shape change (SwapGroupSpecification.md's
  // own stated purpose for the tiering).
  return { swapGroupId: relevant.tag, eligibleComponents, confidence: 'tag-co-membership', diagnostics }
}
