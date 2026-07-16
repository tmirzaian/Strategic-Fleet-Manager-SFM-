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
 * `sidebarCommissioningMark` (EWO-014A) resolved the Sidebar's enlarged
 * (~72px display) mark-only presentation to the 256px square-logo
 * derivative. EWO-015 superseded that presentation entirely — the
 * Sidebar no longer renders a standalone mark plus JSX-reconstructed
 * wordmark/title/motto; it renders one commissioned lockup image instead
 * (`sidebarBrandLockup`, below). `sidebarCommissioningMark` is retained,
 * unused today, exactly like `compactMark` — a semantic key describes a
 * usage, and both remain valid for any future context that genuinely
 * needs the square mark alone rather than the full portrait lockup.
 *
 * `sidebarBrandLockup` (EWO-015) is the Sidebar's brand-lockup hardpoint:
 * one Design-Authority-owned, transparent, portrait production image
 * containing the commissioning mark, "SFM" wordmark, "Strategic Fleet
 * Manager" title, and motto already composed together — deliberately
 * excluding the application version (which stays live JSX text rendered
 * beneath the image; see src/components/Sidebar.tsx). Source master:
 * public/assets/branding/sidebar/sidebar-branding-master-1024.png
 * (1024x1536, portrait, RGBA, true alpha — verified by
 * scripts/generateBrandingAssets.ts before any derivative is generated).
 * Resolves to the 512px derivative: the Sidebar hardpoint targets a
 * ~170px display width, and 512px gives roughly 3x headroom above that
 * for HiDPI displays without the application ever loading the 1024px
 * master directly.
 *
 * `compactMark`/`sidebarCommissioningMark` and `sidebarBrandLockup`
 * intentionally derive from two entirely different masters (the square
 * commissioning-mark master vs. the portrait brand-lockup master) at
 * purpose-matched output sizes — never the same file reused at two
 * display scales, and never one master's derivative repurposed for the
 * other's role.
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
  sidebarBrandLockup: {
    key: 'sidebarBrandLockup',
    label: 'Sidebar Brand Lockup',
    enabled: true,
    src: assetPath('generated/branding/sidebar-branding-512.png'),
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
