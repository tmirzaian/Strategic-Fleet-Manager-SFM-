import { assetPath } from './assetPaths'
import type { BrandingAssetDefinition, BrandingAssetKey } from './types'

/**
 * `compactMark` is the approved commissioning logo (EWO-003's
 * deterministic branding pipeline — public/assets/branding/logo/), sized
 * for genuinely compact (~16-64px) placements — not currently consumed
 * anywhere, retained for that future use case (Principle: a semantic key
 * describes a usage, not just a pixel size that happens to be enabled
 * today).
 *
 * `sidebarCommissioningMark` (EWO-014A) is the distinct key for the
 * Sidebar's enlarged (~72px display) brand-lockup mark — EWO-014
 * enlarged that mark's on-screen size, but it was still sourced from the
 * 64px derivative, which Commander visual inspection correctly flagged
 * as insufficient fidelity for an enlarged presentation. Resolves to the
 * 256px derivative instead, giving real headroom above the ~72px display
 * size (including for high-DPI displays), without repointing the
 * genuinely-compact `compactMark` key to a larger asset it was never
 * meant to carry.
 *
 * `compactMark` and `sidebarCommissioningMark` intentionally derive from
 * the same deterministic master (see scripts/generateBrandingAssets.ts)
 * at different, purpose-matched output sizes — never the same file used
 * at two different display scales.
 *
 * The remaining keys have no approved artwork yet and stay
 * `enabled: false` — a future handoff flips each on with its own
 * `public/assets/branding/...` path.
 */
export const BRANDING_ASSETS: Record<BrandingAssetKey, BrandingAssetDefinition> = {
  primaryLogo: { key: 'primaryLogo', label: 'Primary Logo', enabled: false },
  compactMark: { key: 'compactMark', label: 'Compact Mark', enabled: true, src: assetPath('branding/logo/sfm-logo-64.png') },
  sidebarCommissioningMark: {
    key: 'sidebarCommissioningMark',
    label: 'Sidebar Commissioning Mark',
    enabled: true,
    src: assetPath('branding/logo/sfm-logo-256.png'),
  },
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
