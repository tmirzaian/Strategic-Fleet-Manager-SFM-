/**
 * Parsing and freshness comparison for the installed Star Citizen
 * `build_manifest.id`. Kept pure/testable — no filesystem access here;
 * the generator script reads the file and passes its text to
 * `parseBuildManifest`.
 */

export interface BuildManifest {
  branch: string
  version: string
  requestedP4ChangeNum: string
  buildDateStamp?: string
  tag?: string
  config?: string
  platform?: string
}

/**
 * Parses `build_manifest.id` (a JSON file with a top-level `Data` object).
 * Throws with a clear, specific message on malformed JSON or missing
 * required fields — never returns a partially-guessed manifest.
 */
export function parseBuildManifest(jsonText: string): BuildManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    throw new Error(`Unreadable/malformed build manifest JSON: ${(err as Error).message}`)
  }

  const data = parsed && typeof parsed === 'object' ? (parsed as { Data?: unknown }).Data : undefined
  if (!data || typeof data !== 'object') {
    throw new Error('Malformed build manifest: missing top-level "Data" object.')
  }

  const { Branch, Version, RequestedP4ChangeNum, BuildDateStamp, Tag, Config, Platform } = data as Record<string, unknown>

  if (typeof Branch !== 'string' || Branch.length === 0) {
    throw new Error('Malformed build manifest: missing or invalid "Data.Branch".')
  }
  if (typeof Version !== 'string' || Version.length === 0) {
    throw new Error('Malformed build manifest: missing or invalid "Data.Version".')
  }
  if (typeof RequestedP4ChangeNum !== 'string' || RequestedP4ChangeNum.length === 0) {
    throw new Error('Malformed build manifest: missing or invalid "Data.RequestedP4ChangeNum".')
  }

  return {
    branch: Branch,
    version: Version,
    requestedP4ChangeNum: RequestedP4ChangeNum,
    buildDateStamp: typeof BuildDateStamp === 'string' ? BuildDateStamp : undefined,
    tag: typeof Tag === 'string' ? Tag : undefined,
    config: typeof Config === 'string' ? Config : undefined,
    platform: typeof Platform === 'string' ? Platform : undefined,
  }
}

export type CatalogFreshness = 'current' | 'stale' | 'unverifiable'

export interface CatalogSourceBuildInfo {
  gameBranch: string
  gameVersion: string
  p4ChangeNum: string
}

/**
 * Compares a catalog's recorded source build info against the currently
 * installed build manifest. Not wired into the application — reusable,
 * independently unit-tested, for a future integration to call.
 */
export function compareCatalogFreshness(
  catalogSource: CatalogSourceBuildInfo | null | undefined,
  currentManifest: BuildManifest | null | undefined
): CatalogFreshness {
  if (!catalogSource || !currentManifest) return 'unverifiable'
  if (!catalogSource.gameBranch || !catalogSource.gameVersion || !catalogSource.p4ChangeNum) return 'unverifiable'

  const matches =
    catalogSource.gameBranch === currentManifest.branch &&
    catalogSource.gameVersion === currentManifest.version &&
    catalogSource.p4ChangeNum === currentManifest.requestedP4ChangeNum

  return matches ? 'current' : 'stale'
}
