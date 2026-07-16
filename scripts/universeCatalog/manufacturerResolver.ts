/**
 * Manufacturer reference resolution (Mission M-012).
 *
 * A bulk field query whose leaf property is a manufacturer reference
 * (`Components[VehicleComponentParams].manufacturer`,
 * `Components[SAttachableComponentParams].AttachDef.Manufacturer`) comes
 * back from StarBreaker fully resolved — an `SCItemManufacturer` object
 * carrying a stable `Code` (e.g. "AEGS", "ARGO") and a `Localization.Name`
 * key — rather than the raw unresolved file-path pointer a full
 * unfiltered record dump would show. Querying the whole object as one
 * field is correct but was found to overflow Node's maximum string
 * length across the full ~25,544-component universe (each of the object's
 * deeply-nested, largely-irrelevant sub-fields, e.g. dashboard UI config,
 * is repeated once per component) — so the generators query the two
 * specific leaf fields actually needed (`.Manufacturer.Code` and
 * `.Manufacturer.Localization.Name`) directly instead, which is both
 * dramatically smaller and faster. `Code` is itself an authoritative
 * DataCore field (never inferred or invented here), so it doubles as both
 * the stable user-facing identifier and the provenance-preserving raw
 * reference this record actually carries.
 */

export interface ResolvedManufacturer {
  /** Stable, authoritative short code straight from DataCore (e.g. "AEGS"). Never invented. */
  code: string
  /** DataCore localization key for the full manufacturer name (e.g. "@manufacturer_NameAEGS"). */
  localizationKey: string | null
}

/** Combines a bulk-queried `.Manufacturer.Code` value with the matching `.Manufacturer.Localization.Name` value, or null if the code is absent. */
export function parseManufacturerReference(code: string | undefined, localizationKey: string | undefined): ResolvedManufacturer | null {
  if (!code) return null
  return { code, localizationKey: localizationKey ?? null }
}
