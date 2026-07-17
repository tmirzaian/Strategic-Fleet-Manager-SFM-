import { shipCatalogSource } from '../generated/shipCatalog'

/**
 * CWO-005 (Task 5) — "what Star Citizen build is this Golden Fleet data
 * certified against" derived live from the real catalog metadata
 * (`shipCatalogSource.gameVersion`, e.g. "4.9.186.42610") rather than a
 * hardcoded string, so this can never silently drift from whatever was
 * actually last imported. Returns undefined (never a guess) when no
 * catalog has been generated locally.
 */
export function resolveCertifiedGameVersionLabel(): string | undefined {
  const gameVersion = shipCatalogSource?.gameVersion
  if (!gameVersion) return undefined
  const [major, minor] = gameVersion.split('.')
  if (!major || !minor) return undefined
  return `${major}.${minor}.x`
}
