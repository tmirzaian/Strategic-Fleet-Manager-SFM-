/**
 * Single source of truth for the application version shown in the UI
 * (AppFooter, Captain's Log) and anywhere else it's needed. Change it
 * here only — no other file should hardcode a sprint/version string.
 *
 * ENG-001 / ENG-001A — Development Version Discipline. The dev branch's
 * version string always identifies which stream is actually running, so
 * screenshots and bug reports self-identify without anyone having to ask
 * "which build is this?". Four states, one always active at a time:
 *
 *   Active development  →  "Beta X.Y Dev"   (e.g. "Beta 2.0 Dev")
 *   Release candidate    →  "Beta X.Y RC"    (e.g. "Beta 2.0 RC")
 *   Released build        →  "Beta X.Y"       (e.g. "Beta 2.0")
 *   Next dev stream        →  "Beta X.(Y+1) Dev"  (e.g. "Beta 2.1 Dev")
 *
 * "Dev" (not "Preview" / "In Development") is the one approved suffix —
 * concise, unambiguous, safe for internal builds and screenshots.
 * Whenever a release is packaged: bump to "Beta X.Y RC" for
 * release-candidate validation, then to plain "Beta X.Y" for the
 * certified release package, then — immediately, same day — bump the
 * development branch straight to "Beta X.(Y+1) Dev". Never leave the dev
 * branch sitting on a released or RC string after cutting a release.
 */
export interface AppVersionInfo {
  productVersion: string
  dataPackVersion?: string
  buildId?: string
}

export const APP_VERSION: AppVersionInfo = {
  productVersion: 'Beta 2.0 Dev',
  dataPackVersion: undefined,
  buildId: undefined,
}

/** Short label for compact UI chrome, e.g. "Manager · Alpha 2.1". */
export const APP_VERSION_LABEL = APP_VERSION.productVersion
