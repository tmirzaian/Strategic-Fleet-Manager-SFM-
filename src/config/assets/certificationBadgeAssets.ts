import { assetPath } from './assetPaths'
import type { CertificationBadgeDefinition, CertificationBadgeVariant } from './types'

/**
 * EWO-095B — see `CertificationBadgeVariant`'s own doc comment (types.ts)
 * for why this is a distinct registry from `BrandingAssetKey`. The seal
 * master is a single, already-appropriately-sized square PNG with alpha —
 * no responsive-tier pipeline is warranted here (unlike the photographic
 * environment/illustration backgrounds), matching the existing
 * `compactMark`/`sidebarCommissioningMark` precedent of referencing an
 * approved raster directly.
 */
export const CERTIFICATION_BADGES: Record<CertificationBadgeVariant, CertificationBadgeDefinition> = {
  community: {
    variant: 'community',
    label: 'Community Certified Seal',
    alt: 'Community Certified',
    src: assetPath('branding/community/community-certified-seal.png'),
    enabled: true,
  },
}

export function getCertificationBadge(variant: CertificationBadgeVariant): CertificationBadgeDefinition {
  return CERTIFICATION_BADGES[variant]
}

/** Resolved src, or undefined when this variant isn't enabled/has no approved artwork yet — callers must render nothing rather than a broken `<img>`. */
export function resolveCertificationBadgeSrc(variant: CertificationBadgeVariant): string | undefined {
  const def = CERTIFICATION_BADGES[variant]
  return def.enabled && def.src ? def.src : undefined
}
