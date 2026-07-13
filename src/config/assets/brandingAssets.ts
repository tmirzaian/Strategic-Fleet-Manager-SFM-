import { assetPath } from './assetPaths'
import type { BrandingAssetDefinition, BrandingAssetKey } from './types'

/**
 * `compactMark` is the approved commissioning logo (EWO-003's
 * deterministic branding pipeline — public/assets/branding/logo/), used
 * at small sidebar-icon scale. It replaces the sidebar's placeholder
 * `Satellite` vector icon (see src/components/Sidebar.tsx), which stays
 * as a defensive fallback if this entry is ever disabled again. The
 * other three keys have no approved artwork yet and remain
 * `enabled: false` — a future handoff flips each on with its own
 * `public/assets/branding/...` path.
 */
export const BRANDING_ASSETS: Record<BrandingAssetKey, BrandingAssetDefinition> = {
  primaryLogo: { key: 'primaryLogo', label: 'Primary Logo', enabled: false },
  compactMark: { key: 'compactMark', label: 'Compact Mark', enabled: true, src: assetPath('branding/logo/sfm-logo-64.png') },
  monochromeMark: { key: 'monochromeMark', label: 'Monochrome Mark', enabled: false },
  appIcon: { key: 'appIcon', label: 'App Icon', enabled: false },
}

export function getBrandingAsset(key: BrandingAssetKey): BrandingAssetDefinition {
  return BRANDING_ASSETS[key]
}

/** Resolved src, or undefined when the asset isn't approved/enabled yet — callers must render their existing fallback (e.g. the current vector-icon lockup) rather than an empty <img>. */
export function resolveBrandingSrc(key: BrandingAssetKey): string | undefined {
  const asset = BRANDING_ASSETS[key]
  return asset.enabled && asset.src ? asset.src : undefined
}
