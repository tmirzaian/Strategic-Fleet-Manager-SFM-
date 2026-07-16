/**
 * EWO-038 (Task 3/4) — the canonical selectable-hull dataset this tool
 * matches the Commander's workbook against. Reads `selectableShipDefinitions`
 * (src/data/shipDefinitions.ts) — never modifies it (NOT AUTHORIZED to alter
 * shipDefinitions.ts). Must be run via `vite-node`, not plain `tsx`/`node`:
 * shipDefinitions.ts transitively imports generated modules that use Vite's
 * `import.meta.glob` (see scripts/goldenFleet/manifest.ts's own header for
 * the same constraint on that mission's tooling).
 */
import { selectableShipDefinitions, presentationImageKeyById, shipDefinitions } from '../../src/data/shipDefinitions'

export interface CanonicalHullRow {
  /** The exact id Task 3's maintenance CSV shows the Commander — the
   * ShipDefinition's own `.id`. */
  canonicalId: string
  /** The id `src/data/shipImageRegistry.ts` must actually key runtime
   * entries by — for a deep-imported hull this is its raw StarBreaker
   * entity class (e.g. "DRAK_Corsair"), not `canonicalId` (e.g.
   * "corsair-imported"); for every other hull the two are identical. Reuses
   * `presentationImageKeyById` (already exported, read-only) rather than
   * reimplementing that distinction. */
  registryKey: string
  displayName: string
  manufacturer: string
  /** 'seed' | 'StarBreaker' (deep-imported or Mission M-012 catalog-only) —
   * mirrors ShipDefinition.sourceMetadata.sourceType, used only to decide
   * whether a manufacturer-prefix strip is safe (see bareDisplayName). */
  sourceType: string
  sourceFile?: string
  /**
   * `displayName` with a leading manufacturer-name prefix removed, only
   * when that prefix is genuinely the definition's own `manufacturer`
   * field (never a guess) and only for a Mission M-012 catalog-only
   * definition (the only source that bakes the manufacturer directly into
   * `displayName`) — the same safe stripping rule shipDefinitions.ts's own
   * (private, unexported) `bareHullName()` uses for duplicate-hull
   * detection, reimplemented here independently so this tool never needs
   * that file to export anything new.
   */
  bareDisplayName: string
  /** True when this hull already has a non-empty existing image
   * (`image.primaryUrl` or legacy `imageUrl`) from the deep-import
   * pipeline or seed data — i.e. resolution tier 2 of
   * `resolveShipImage()`, independent of this mission's registry (Task 10
   * reports this distinctly from "registry" vs "true fallback"). */
  hasExistingImportedImage: boolean
}

/**
 * EWO-038 (Task 4, tier 4 — "manufacturer-prefix normalization") — a small,
 * explicit, reviewed table of manufacturer full names whose Mission M-012
 * catalog `displayName` prefix is their well-known abbreviation rather than
 * the literal manufacturer string (so the generic `manufacturer.startsWith`
 * check below can't recognize it): "RSI" for Roberts Space Industries,
 * "MISC" for Musashi Industrial & Starflight Concern, "C.O." for
 * Consolidated Outland. Discovered by direct comparison of all 258
 * canonical hulls (only these three manufacturers exhibit this pattern
 * today) — not a guess, and never applied to any other prefix word.
 */
const KNOWN_MANUFACTURER_ABBREVIATIONS: ReadonlyMap<string, string> = new Map([
  ['roberts space industries', 'rsi'],
  ['musashi industrial & starflight concern', 'misc'],
  ['consolidated outland', 'co'],
])

function bareDisplayName(displayName: string, manufacturer: string, sourceType: string, sourceFile: string | undefined): string {
  if (sourceType !== 'StarBreaker' || sourceFile !== 'ship-catalog') return displayName
  const firstWord = displayName.split(' ')[0]
  if (!firstWord) return displayName
  const normalizedFirstWord = firstWord.toLowerCase().replace(/\./g, '')
  const normalizedManufacturer = manufacturer.toLowerCase()
  const isDirectPrefix = normalizedManufacturer.startsWith(firstWord.toLowerCase())
  const isKnownAbbreviation = KNOWN_MANUFACTURER_ABBREVIATIONS.get(normalizedManufacturer) === normalizedFirstWord
  if (isDirectPrefix || isKnownAbbreviation) {
    return displayName.slice(firstWord.length).trim()
  }
  return displayName
}

function toRow(d: (typeof selectableShipDefinitions)[number]): CanonicalHullRow {
  const sourceFile = (d.sourceMetadata as { sourceFile?: string }).sourceFile
  return {
    canonicalId: d.id,
    registryKey: presentationImageKeyById.get(d.id) ?? d.id,
    displayName: d.displayName,
    manufacturer: d.manufacturer,
    sourceType: d.sourceMetadata.sourceType,
    sourceFile,
    bareDisplayName: bareDisplayName(d.displayName, d.manufacturer, d.sourceMetadata.sourceType, sourceFile),
    hasExistingImportedImage: Boolean(d.image?.primaryUrl?.trim()) || Boolean(d.imageUrl?.trim()),
  }
}

/** All 258 (as of EWO-038) canonical selectable hulls, sorted by
 * manufacturer then ship name (Task 3's required CSV ordering). */
export function getCanonicalHullRows(): CanonicalHullRow[] {
  return selectableShipDefinitions.map(toRow).sort((a, b) => a.manufacturer.localeCompare(b.manufacturer) || a.displayName.localeCompare(b.displayName))
}

/** Every definition (canonical or superseded/non-selectable) — used only
 * by the matcher's EXISTING_ALIAS tier (Task 4, tier 3) to recognize a
 * workbook name that matches a superseded definition's own display name
 * and redirect to its canonical winner. Read-only; never mutates
 * shipDefinitions.ts. */
export function getAllDefinitionRowsForAliasLookup(): CanonicalHullRow[] {
  return shipDefinitions.map(toRow)
}
