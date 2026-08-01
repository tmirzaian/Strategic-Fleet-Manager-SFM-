import type { ReactNode } from 'react'
import type { EnvironmentId } from '../../config/assets/types'
import PageEnvironment from './PageEnvironment'

export interface EnvironmentBayProps {
  id: EnvironmentId
  children: ReactNode
  /** Tailwind max-width class for the floating content column inside the
   * bay. Defaults to Decision Center's own column width; a future
   * department reaching for a wider or narrower operational surface can
   * override it without touching the bay's own composition rules. */
  contentClassName?: string
  /** Chief Architect Asset Handoff — Tailwind min-height class for the
   * bay's own bounded room. Defaults to the standard `lg:min-h-[560px]`
   * full "room" size every existing bay (Decision Center) uses. A
   * sub-panel empty state (e.g. Mission Control's "No Vessels Assigned"
   * card) is not a full department room and explicitly should NOT take on
   * that height — pass a smaller value (e.g. `lg:min-h-[300px]`) rather
   * than forcing every future compact use to fight the 560px default. */
  minHeightClassName?: string
  /** EWO-095A — "Canonical Image Presentation & Environmental Clarity."
   * 0-1 opacity for the bay's own edge vignette (the `rgba(7,16,22,X)`
   * end-stop of its radial gradient below). Defaults to `0.15` — a
   * substantial reduction from the pre-EWO-095A default of `0.92`
   * (Decision Center's own original tuned value): the canonical rule is
   * now that environment plates render crisp and visible at intended
   * fidelity, with legibility coming from the foreground panels'
   * semi-opaque graphite + backdrop-blur treatment, not from darkening
   * the artwork. `0` skips rendering the vignette layer entirely rather
   * than rendering a fully-transparent no-op div; a future page that
   * genuinely needs stronger edge darkening can still pass a larger
   * value explicitly. */
  vignetteOpacity?: number
}

/**
 * UX-003B Amendment A — "Global Environmental Composition Standard."
 * Every department gets its own bounded physical room, never a page-wide
 * background: environment artwork is confined to this one large,
 * bordered container (never stretched across the page — Deliverable 1),
 * operational content floats inside it as glass cards over the artwork
 * rather than sitting on the page background (Deliverable 2), and the
 * artwork itself softly vignettes toward the container's own edges
 * rather than cutting off hard (Deliverable 5). Page headers are never
 * passed as `children` — they stay outside the bay entirely, exactly as
 * Mission Control's own Command Briefing Hero already does (Deliverable
 * 4). See docs/UI_ARCHITECTURE.md §56 for the full standard and how
 * Fleet Dashboard/Captain's Log/Organization should adopt it later.
 *
 * Below the `lg` breakpoint the bay reverts to a plain, unbordered
 * wrapper with no glass treatment — `children` keep whatever base
 * (opaque) styling they already have — matching Mission Control's own
 * mobile simplification (EWO-035A-R2) rather than fighting a background
 * image at narrow widths.
 */
export default function EnvironmentBay({ id, children, contentClassName = 'max-w-2xl', minHeightClassName = 'lg:min-h-[560px]', vignetteOpacity = 0.15 }: EnvironmentBayProps) {
  return (
    <div className={`relative overflow-hidden rounded-xl lg:border lg:border-white/15 ${minHeightClassName} lg:flex lg:items-center lg:justify-center lg:py-16 lg:px-10`}>
      <PageEnvironment id={id} />
      {/* Edge treatment (Deliverable 5) — the artwork itself softly
          vignettes toward the bay's own border rather than ending in a
          hard image cutoff; the container's rounded-xl/border shape stays
          consistent with Mission Control's own room, only the image
          content fades. Opacity is configurable (Revision 2) — skipped
          entirely at 0 rather than rendering a no-op transparent layer. */}
      {vignetteOpacity > 0 && (
        <div
          className="hidden lg:block absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse 75% 70% at 50% 50%, transparent 40%, rgba(7,16,22,${vignetteOpacity}) 100%)` }}
          aria-hidden="true"
        />
      )}
      <div className={`relative z-10 w-full ${contentClassName} mx-auto space-y-6`}>{children}</div>
    </div>
  )
}
