/// <reference types="vite/client" />
/**
 * Browser-side loader for generated-data/configurable-slots.runtime.json
 * (SW-011A — Commander Configurable Slot Experience, Phase I).
 *
 * Same RC-008 posture as `src/generated/componentCatalog.ts` and
 * `src/generated/shipCatalog.ts`: a small, committed runtime subset,
 * derived by `npm run generate:configurable-slots-runtime-catalog` from
 * the live SW-010B fleet sweep, containing only the fields Ship
 * Workspace's inspection panel actually reads (see
 * `scripts/configurableSlots/catalogRuntimeSchema.ts` for the full
 * rationale — only Category A/B/C slots are present at all; Category D
 * false positives and ordinary non-configurable ports never reach this
 * file). `import.meta.glob` is kept as defense in depth: if the runtime
 * file is ever missing, Ship Workspace degrades to showing no
 * configurable-slot badges at all (Objective 5's own regression
 * guarantee — ordinary ports are unaffected either way) rather than
 * failing the build.
 *
 * Deliberately defines its own local type copies rather than importing
 * from `scripts/configurableSlots/catalogRuntimeSchema.ts` — the same
 * scripts/src boundary `src/generated/shipCatalog.ts` and
 * `src/generated/componentCatalog.ts` already keep (see either file's own
 * doc comment for why: catalog-generation-time tooling stays decoupled
 * from runtime code, `docs/ImportPipeline.md`'s established isolation
 * principle).
 */
const modules = import.meta.glob<{ default: unknown }>('../../generated-data/configurable-slots.runtime.json', { eager: true })
const rawCatalog = Object.values(modules)[0]?.default as ConfigurableSlotsRuntimeFile | undefined

export interface ConfigurableSlotRuntimeDiagnostic {
  message: string
  severity: 'info' | 'warning'
}

export interface ConfigurableSlotRuntimeRecord {
  portName: string
  parentPortName: string | null
  defaultComponentEntityClass: string | null
  swapGroupId: string | null
  eligibleComponentCount: number
  /** SW-013C.2B — the real member entity classes (schema v2+). `undefined`
   * on a runtime catalog written before this field existed — callers must
   * treat that as "no operational compatibility data available," never as
   * an empty set. */
  eligibleComponents?: string[]
  confidence: 'confirmed-bidirectional' | 'tag-co-membership' | 'unresolved'
  sourceAuthority: 'geometry-and-configuration' | 'configuration-only'
  category: 'A-confirmed' | 'B-newly-discovered' | 'C-review-required'
  diagnostics: ConfigurableSlotRuntimeDiagnostic[]
}

interface ConfigurableSlotsRuntimeSource {
  gameVersion: string
  generatedAt: string
}

interface ConfigurableSlotsRuntimeFile {
  schemaVersion: number
  source?: ConfigurableSlotsRuntimeSource
  ships: Record<string, ConfigurableSlotRuntimeRecord[]>
}

export const hasConfigurableSlotsCatalog = Boolean(rawCatalog && Object.keys(rawCatalog.ships).length > 0)

/** The real Star Citizen build this catalog was generated against — `undefined` when the runtime catalog is missing. */
export const configurableSlotsGameVersion: string | undefined = rawCatalog?.source?.gameVersion

const emptySlots: ConfigurableSlotRuntimeRecord[] = []

/** Every Commander-visible configurable slot for one ship, keyed by its
 * real DataCore entity class — never a display name. Returns an empty
 * array (never throws, never `undefined`) for a ship with no
 * configurable topology at all — the overwhelming majority of the fleet
 * — so callers never need an existence check before using the result. */
export function getConfigurableSlotsForShip(shipEntityClass: string | null | undefined): ConfigurableSlotRuntimeRecord[] {
  if (!shipEntityClass || !rawCatalog) return emptySlots
  return rawCatalog.ships[shipEntityClass] ?? emptySlots
}

/** SW-013C.2D (Objective 3) — a port's own certified swap-group member
 * entity classes, when a confirmed group exists for it (Category
 * A-confirmed/B-newly-discovered — see `ConfigurableSlotRuntimeRecord`).
 * `undefined` when no record matches this exact (parentPortName, portName)
 * pair — never an empty Set (callers must be able to tell "no confirmed
 * group, defer to the generic sweep" apart from "confirmed group with zero
 * members," which never legitimately happens). Same
 * `${parentPortName ?? ''}::${portName}` key shape `ShipWorkspacePrototype.tsx`'s
 * own `configurableSlotFor` already uses — this is the store-accessible
 * (non-component-scoped) equivalent, for compatibility validation call
 * sites outside that one component (`useFleetStore.ts`,
 * `fleetAssetReconciliation.ts`). */
export function swapGroupEligibleEntityClassesFor(
  shipEntityClass: string | null | undefined,
  parentPortName: string | null | undefined,
  portName: string | null | undefined
): ReadonlySet<string> | undefined {
  if (!portName) return undefined
  const key = `${parentPortName ?? ''}::${portName}`
  for (const record of getConfigurableSlotsForShip(shipEntityClass)) {
    if (`${record.parentPortName ?? ''}::${record.portName}` === key && record.eligibleComponents?.length) {
      return new Set(record.eligibleComponents)
    }
  }
  return undefined
}
