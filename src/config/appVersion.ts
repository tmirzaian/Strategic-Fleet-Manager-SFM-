/**
 * Single source of truth for the application version shown in the UI
 * (Sidebar header) and anywhere else it's needed. Change it here only —
 * no other file should hardcode a sprint/version string.
 */
export interface AppVersionInfo {
  productVersion: string
  dataPackVersion?: string
  buildId?: string
}

export const APP_VERSION: AppVersionInfo = {
  productVersion: 'Alpha 2.5C',
  dataPackVersion: undefined,
  buildId: undefined,
}

/** Short label for compact UI chrome, e.g. "Manager · Alpha 2.1". */
export const APP_VERSION_LABEL = APP_VERSION.productVersion
