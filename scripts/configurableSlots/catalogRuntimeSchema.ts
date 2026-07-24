/**
 * SW-011A — Configurable Slot Runtime Catalog.
 *
 * Types and constants for `generated-data/configurable-slots.runtime.json`
 * — the small, committed, browser-consumable derivative of the full
 * SW-010B certification sweep (`generated-data/configurable-slot-certification.json`,
 * gitignored, dev-only). Same RC-008 rationale as
 * `scripts/componentCatalog/catalogRuntimeSchema.ts` and
 * `scripts/shipCatalog/shipCatalogRuntimeSchema.ts`: the full sweep output
 * carries per-diagnostic detail, manufacturer codes, and every port on
 * every ship (including the ~83% that are ordinary, non-configurable
 * ports) — none of which the browser needs. This file's shape is only
 * ever the fields `src/generated/configurableSlots.ts` (the browser
 * loader) and Ship Workspace's inspection panel actually read.
 *
 * Only Category A (confirmed), B (newly discovered), and C (review
 * required) slots are included — Category D (rejected false positives,
 * e.g. an eligible set containing an AI/mission-variant name) are never
 * written here at all. A Commander should never see a false positive;
 * Category C is shown with a lower-confidence indicator (Objective 4),
 * never hidden — see `SW-010B-Certification-Report.md` §5 for why C is
 * "documented, not forced," which is exactly what surfacing it
 * read-only, with a visible caveat, means in Commander-facing terms.
 */

// SW-013C.2B — bumped 1 -> 2 to add `eligibleComponents` (the real member
// list, not just a count). SW-011A's own Phase I was deliberately
// read-only visibility ("never the full member list... not a picker") —
// this mission activates real operational actions (target selection,
// swap-group-only compatibility, Objective 3) on Module-classified ports,
// which requires the actual entity classes a Commander can choose
// between, not just how many exist. `eligibleComponentCount` is kept,
// unchanged, alongside the new field — every existing reader of the count
// (the read-only inspection panel) is unaffected.
export const CONFIGURABLE_SLOTS_RUNTIME_SCHEMA_VERSION = 2
export const CONFIGURABLE_SLOTS_RUNTIME_FILENAME = 'configurable-slots.runtime.json'

export interface ConfigurableSlotRuntimeDiagnostic {
  message: string
  severity: 'info' | 'warning'
}

export interface ConfigurableSlotRuntimeRecord {
  /** The exact DataCore `itemPortName` — e.g. "hardpoint_weapon_center". Matched at runtime against `Hardpoint.sourceItemPortName`. */
  portName: string
  /** Null for a top-level slot; the immediate parent's `itemPortName` for a nested one. */
  parentPortName: string | null
  /** The real DataCore entity class currently the factory default for this slot, or null when genuinely unresolvable. */
  defaultComponentEntityClass: string | null
  swapGroupId: string | null
  /** Count only — retained for the existing read-only inspection panel. Always equals `eligibleComponents.length`. */
  eligibleComponentCount: number
  /** SW-013C.2B — the real member entity classes, in the same order the
   * swap-group resolver produced them. Absent (undefined) on a runtime
   * catalog written before schema v2 — callers must treat that as "no
   * operational compatibility data available," never as an empty set
   * (an empty array is a real, confirmed-zero-alternatives fact; a
   * missing field is "we don't know," a different fact). */
  eligibleComponents?: string[]
  confidence: 'confirmed-bidirectional' | 'tag-co-membership' | 'unresolved'
  sourceAuthority: 'geometry-and-configuration' | 'configuration-only'
  category: 'A-confirmed' | 'B-newly-discovered' | 'C-review-required'
  /** Developer-Mode-only detail (Objective 4: "do not expose raw diagnostics unless Developer Mode is enabled"). Small by construction — only ever a handful of entries per slot. */
  diagnostics: ConfigurableSlotRuntimeDiagnostic[]
}

export interface ConfigurableSlotsRuntimeSource {
  gameVersion: string
  generatedAt: string
}

export interface ConfigurableSlotsRuntimeFile {
  schemaVersion: number
  source: ConfigurableSlotsRuntimeSource
  /** Keyed by ship entity class (e.g. "AEGS_Retaliator") — matches `ImportedShipView.ship.sourceEntityClass` / the deep-import identity already established throughout the app (ADR-010). */
  ships: Record<string, ConfigurableSlotRuntimeRecord[]>
}
