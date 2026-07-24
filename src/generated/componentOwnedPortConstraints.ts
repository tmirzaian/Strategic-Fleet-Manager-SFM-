/// <reference types="vite/client" />
/**
 * Browser-side loader for generated-data/component-owned-port-constraints.json
 * (EWO-055) — see scripts/generateComponentOwnedPortConstraints.ts for the
 * full derivation and the EWO-055 proving-spike findings behind it.
 * Committed (not gitignored), same licensing posture as
 * missileRackSlots.ts/miningModuleSlots.ts: a small map of resolved facts
 * per owning entityClass (its own real port names, sizes, and accepted
 * type/subtype pairs), never raw DataCore record ids/paths.
 *
 * `import.meta.glob` (not a plain static import), matching every other
 * committed generated-data loader — if the file is ever missing, every
 * lookup degrades to "no known constraint" instead of failing the build.
 *
 * EWO-055 SCOPE BOUNDARY: this loader is not yet consumed by
 * `validateTargetCompatibility`/`isComponentSelectableForPort` or any
 * other compatibility/readiness/installation code path — wiring it in is
 * explicitly separate future work, pending its own Chief Architect
 * review. This file exists so that future work has something to import;
 * nothing currently calls it.
 *
 * EWO-056B — `PortConstraintRecord` gained `editable` (from
 * `SItemPortDef.Flags`, see the generator's own doc comment). Exposed
 * here purely as acquired data, same as every other field on this
 * record — no consumer in this repository reads it yet.
 */

export interface PortAcceptedType {
  type: string
  subtypes: string[]
}

export interface PortConstraintRecord {
  minSize: number | null
  maxSize: number | null
  accepted: PortAcceptedType[]
  /** EWO-056B — DataCore's own authoritative upgrade-authority state for
   * this exact port (`SItemPortDef.Flags`, normalized). `true` =
   * editable, `false` = locked (`Flags` said "uneditable" or
   * "$uneditable" — treated as equivalent), `null` = unknown/
   * unavailable. Source metadata only; not yet read by any consumer. */
  editable: boolean | null
}

interface ComponentOwnedPortConstraintsDocument {
  byEntityClass?: Record<string, { portsByName?: Record<string, PortConstraintRecord> }>
}

const modules = import.meta.glob<{ default: unknown }>('../../generated-data/component-owned-port-constraints.json', { eager: true })
const rawFile = Object.values(modules)[0]?.default as ComponentOwnedPortConstraintsDocument | undefined

const byEntityClass: Record<string, { portsByName: Record<string, PortConstraintRecord> }> = Object.fromEntries(
  Object.entries(rawFile?.byEntityClass ?? {}).map(([entityClass, entry]) => [entityClass, { portsByName: entry.portsByName ?? {} }])
)

/**
 * The real, source-derived accept-list a given owning entity's own named
 * port carries on its own DataCore record — `null` when either the owner
 * entityClass or that exact port name isn't in the table (an
 * uncataloged/unresolved entity, a family this generator doesn't cover
 * yet, or a port name that genuinely doesn't exist on that entity's
 * record). Never guessed, never derived from a display name or from the
 * owner's nominal category/size.
 */
export function getComponentOwnedPortConstraint(ownerEntityClass: string | null | undefined, portName: string | null | undefined): PortConstraintRecord | null {
  if (!ownerEntityClass || !portName) return null
  return byEntityClass[ownerEntityClass]?.portsByName[portName] ?? null
}
