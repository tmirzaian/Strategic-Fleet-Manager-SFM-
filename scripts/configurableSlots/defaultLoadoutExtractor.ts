/**
 * SW-010A (Objective 1) — Default Loadout Extractor.
 *
 * Reads `SEntityComponentDefaultLoadoutParams` (ADR-014 Authority 2) from
 * a full DCB entity record — the same `RawDcbRecordJson` shape
 * `scripts/componentCatalog/dcbQuery.ts`'s `runDcbQuery`/`parseDcbQueryResult`
 * already produce for a per-entity `dcb query`. Deliberately independent
 * of geometry parsing (`src/normalizer`, `scripts/goldenFleet`) — this
 * module only ever answers "what configuration points does this entity's
 * own DataCore record declare?", exactly like `rawEntityCollector.ts`
 * only ever answers "which entity classes does this document mention?"
 * (docs/ImportPipeline.md's established isolation principle).
 *
 * Every function here is pure — no StarBreaker process spawn, no file
 * I/O. The live `dcb query` call is the caller's responsibility (see
 * `scripts/generateConfigurableSlotReport.ts`), exactly like
 * `dcbQuery.ts` itself separates `runDcbQuery` (I/O) from
 * `parseDcbQueryResult`/`extractItemDefinitionFields` (pure).
 */
import type { RawDcbRecordJson } from '../componentCatalog/dcbQuery'
import type { DefaultLoadoutConfigurationEntry, DefaultLoadoutDiagnostic, DefaultLoadoutExtractionResult } from './types'

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

interface RawLoadoutEntry {
  itemPortName: string
  entityClassName: string
  entityClassReference: string | null
  loadout: { entries?: unknown } | null
}

function parseRawEntry(raw: unknown): RawLoadoutEntry | null {
  if (!isObject(raw)) return null
  const itemPortName = raw.itemPortName
  if (typeof itemPortName !== 'string' || !itemPortName) return null
  const entityClassName = typeof raw.entityClassName === 'string' ? raw.entityClassName : ''
  const entityClassReference = typeof raw.entityClassReference === 'string' ? raw.entityClassReference : null
  const loadout = isObject(raw.loadout) ? (raw.loadout as { entries?: unknown }) : null
  return { itemPortName, entityClassName, entityClassReference, loadout }
}

/**
 * Locates the `SEntityComponentDefaultLoadoutParams` component within a
 * full entity record's `Components[]` array. Returns `null` when the
 * entity genuinely has no default-loadout component at all (not every
 * `EntityClassDefinition` is a vehicle with mountable ports) — this is
 * never an error, per ImportPipeline-v2.md's Stage 7 "Failure behavior."
 */
export function findDefaultLoadoutComponent(record: RawDcbRecordJson): unknown {
  const recordValue = record._RecordValue_
  if (!isObject(recordValue)) return null
  const components = recordValue.Components
  if (!Array.isArray(components)) return null
  return components.find((c) => isObject(c) && c._Type_ === 'SEntityComponentDefaultLoadoutParams') ?? null
}

/**
 * Recursively walks the raw `loadout.entries[]` tree, classifying every
 * entry (materialized or configurable-candidate) and recording
 * diagnostics. Depth-first, mirroring the exact recursion shape DataCore
 * itself uses (never flattened, never re-ordered).
 */
function walk(entries: unknown, parentItemPortName: string | null, ancestorPortNames: string[], out: DefaultLoadoutConfigurationEntry[], diagnostics: DefaultLoadoutDiagnostic[]): void {
  if (!Array.isArray(entries)) return
  for (const raw of entries) {
    const parsed = parseRawEntry(raw)
    if (!parsed) continue

    const nestedEntries = parsed.loadout?.entries
    const hasNestedEntries = Array.isArray(nestedEntries) && nestedEntries.length > 0

    const entry: DefaultLoadoutConfigurationEntry = {
      itemPortName: parsed.itemPortName,
      parentItemPortName,
      ancestorPortNames,
      factoryEntityClassName: parsed.entityClassName ? parsed.entityClassName : null,
      factoryEntityClassReference: parsed.entityClassReference,
      hasNestedEntries,
    }
    out.push(entry)

    // Reference-only entry: no inline default, a real reference. NOT, on
    // its own, proof of a true Configurable Slot — see
    // `DefaultLoadoutExtractionResult.referenceOnlyEntries`'s own doc
    // comment for the live-verified counter-example (ordinary leaf
    // components like a Cooler/Power Plant use this exact shape too).
    // Recorded as a candidate for Stage 9 to cross-check against the
    // Physical Port Graph, never asserted as configurable here.
    if (!entry.factoryEntityClassName && entry.factoryEntityClassReference) {
      diagnostics.push({
        code: 'configuration-entry-found',
        message: `Reference-only entry at "${entry.itemPortName}" (reference: ${entry.factoryEntityClassReference}) — candidate for Stage 9's Physical Port Graph cross-check, not yet confirmed configurable.`,
        itemPortName: entry.itemPortName,
        severity: 'info',
      })
    }
    // An entry with NEITHER an inline class NOR a reference NOR nested
    // children is a real anomaly worth surfacing, not silently dropped —
    // this genuinely shouldn't occur in real DataCore data.
    else if (!entry.factoryEntityClassName && !entry.factoryEntityClassReference && !hasNestedEntries) {
      diagnostics.push({
        code: 'configuration-reference-unresolvable',
        message: `Entry at "${entry.itemPortName}" has no inline default, no reference, and no nested children.`,
        itemPortName: entry.itemPortName,
        severity: 'warning',
      })
    }

    if (hasNestedEntries) walk(nestedEntries, parsed.itemPortName, [...ancestorPortNames, parsed.itemPortName], out, diagnostics)
  }
}

/**
 * Objective 1 — "normalize entity references." A `factoryEntityClassReference`
 * is a `file://` path (e.g.
 * `file://./../../../../../libs/foundry/records/entities/scitem/ships/weapon_mounts/fixed/anvl/umnt_anvl_s5_cap_mk2.json`).
 * This function extracts the deterministic, mechanical part — the
 * filename stem — as a stable normalized key.
 *
 * It does **not** resolve that key to a real DataCore entity class.
 * Confirmed live during the ADR-014 investigation: entity classes use a
 * real, non-mechanical casing convention (`UMNT_ANVL_S5_Cap_Mk2`, mixed
 * case) that cannot be derived from the lowercase, underscored file path
 * by any tested transform — both `UMNT_ANVL_S5_CAP_MK2` (naive uppercase)
 * and `umnt_anvl_s5_cap_mk2` (verbatim) were tried live against
 * `dcb query --filter` and neither matched the real record. `dcb query`'s
 * glob filter is case-sensitive against the real entity class name, and
 * no case-insensitive search mode was found. Resolving a normalized
 * reference key to its real entity class therefore remains an open
 * problem (ADR-014 Readiness Review) — this function exists so every
 * caller normalizes the same way, never so a caller can skip verifying
 * the real entity class before trusting one.
 */
export function normalizeEntityClassReference(reference: string): string {
  const withoutProtocol = reference.replace(/^file:\/\//, '')
  const segments = withoutProtocol.split('/')
  const filename = segments[segments.length - 1] ?? withoutProtocol
  return filename.replace(/\.json$/i, '')
}

/**
 * SW-010B (Objective 1) — extracts directly from an already-isolated raw
 * `loadout.entries[]` array, independent of the full per-entity
 * `RawDcbRecordJson` shape. Originally added to support a whole-universe
 * bulk polymorphic field query (`dcb query
 * EntityClassDefinition.Components[SEntityComponentDefaultLoadoutParams].loadout[SItemPortLoadoutManualParams].entries`)
 * as an alternative to one `dcb query --filter <exact>` process per ship.
 * That bulk query did not return within 10+ minutes against the real LIVE
 * Data.p4k (StarBreaker resolving a deeply recursive polymorphic array
 * across ~29k records is far more expensive than a scalar field) — the
 * fleet-wide certification driver (`scripts/generateConfigurableSlotCertification.ts`)
 * ended up using the bounded, proven per-ship `--filter` approach instead,
 * scoped only to the known ~257 raw-data ships. This function is kept
 * because it's still useful (any future caller with an already-isolated
 * entries array, e.g. a unit test, doesn't need a synthetic
 * `RawDcbRecordJson` wrapper) and shares the same `walk` logic as
 * `extractDefaultLoadoutConfiguration`, so both entry points produce
 * identical results for the same underlying entries.
 */
export function extractDefaultLoadoutEntries(entries: unknown): DefaultLoadoutExtractionResult {
  const out: DefaultLoadoutConfigurationEntry[] = []
  const diagnostics: DefaultLoadoutDiagnostic[] = []
  walk(entries, null, [], out, diagnostics)
  const referenceOnlyEntries = out.filter((e) => !e.factoryEntityClassName && e.factoryEntityClassReference)
  return { entries: out, referenceOnlyEntries, diagnostics }
}

/**
 * The one entry point this module exposes for a full per-entity record
 * (the `dcbQuery.ts`-style single-entity query path). Never throws — a
 * record with no default-loadout component, or one whose shape doesn't
 * match expectations, produces an empty result plus (where relevant)
 * diagnostics, exactly like `dcbQuery.ts`'s own "never guessed" contract.
 */
export function extractDefaultLoadoutConfiguration(record: RawDcbRecordJson): DefaultLoadoutExtractionResult {
  const component = findDefaultLoadoutComponent(record)
  if (!isObject(component)) return { entries: [], referenceOnlyEntries: [], diagnostics: [] }

  const loadout = isObject(component.loadout) ? (component.loadout as { entries?: unknown }) : null
  return extractDefaultLoadoutEntries(loadout?.entries)
}
