import { shipCatalogSource } from '../generated/shipCatalog'

/**
 * CWO-005 (Task 5) / BP-001 — "what Star Citizen build is this Golden
 * Fleet data certified against" derived live from the real catalog
 * metadata (`shipCatalogSource.gameVersion`, e.g. "4.9.186.42610") rather
 * than a hardcoded string, so this can never silently drift from whatever
 * was actually last imported. Returns the full, exact version string —
 * BP-001 replaced the earlier truncated "4.9.x" presentation with the
 * precise certified build, since a generic "x" reads as unconfirmed
 * rather than a real certification. Returns undefined (never a guess)
 * when no catalog has been generated locally.
 */
export function resolveCertifiedGameVersionLabel(): string | undefined {
  return shipCatalogSource?.gameVersion
}
