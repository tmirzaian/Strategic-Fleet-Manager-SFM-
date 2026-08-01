import { getCertificationBadge, resolveCertificationBadgeSrc } from '../../config/assets'
import type { CertificationBadgeVariant } from '../../config/assets'

interface CertificationBadgeProps {
  variant: CertificationBadgeVariant
  /** Extra classes merged onto the default bottom-right overlay position — lets a future placement/size override without a prop explosion. */
  className?: string
}

/**
 * EWO-095B — a small, reusable overlay responsible only for rendering a
 * certification seal above environmental artwork. It resolves its asset
 * semantically (`variant`, never a raw filename) and renders nothing when
 * that variant has no approved artwork yet, exactly like every other
 * semantic asset resolver in this codebase.
 *
 * Positioned absolutely by default (the caller's own container must be
 * `position: relative`), fully opaque, and `pointer-events-none` since
 * it's a non-interactive mark, not a control. Callers needing a different
 * placement/size for a future context pass `className` to override the
 * position/sizing utilities below without touching this component.
 *
 * EWO-095B Amendment 1 — vertically centered (top-1/2 + -translate-y-1/2)
 * rather than corner-anchored to the card's bottom edge, and sized up
 * ~14-20% across the responsive tiers (w-14/sm:w-16/md:w-20 ->
 * w-16/sm:w-20/md:w-24) so the seal reads as an intentional visual
 * "signature" at the end of the card's left-to-right reading path rather
 * than a decorative corner element. Stays centered as card height changes
 * since the transform is relative to the badge's own height, not a fixed
 * offset.
 */
export default function CertificationBadge({ variant, className }: CertificationBadgeProps) {
  const src = resolveCertificationBadgeSrc(variant)
  if (!src) return null

  const { alt } = getCertificationBadge(variant)

  return (
    <img
      src={src}
      alt={alt}
      className={className ?? 'absolute right-6 top-1/2 -translate-y-1/2 z-10 w-16 sm:w-20 md:w-24 h-auto object-contain pointer-events-none select-none'}
    />
  )
}
