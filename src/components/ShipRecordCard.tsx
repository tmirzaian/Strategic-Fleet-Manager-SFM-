import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { Ship } from '../types'
import type { BuildProgressResult } from '../utils/buildProgress'
import ReadinessBar from './ReadinessBar'
import ShipImage from './ShipImage'
import { FLEET_REGISTRY_PLACEHOLDER } from '../config/assets'

export interface ShipRecordCardProps {
  ship: Ship
  buildName: string
  progress: BuildProgressResult
  /** Optional small overlay slot (e.g. a "PRIORITY 1" rank tag) — kept
   * generic so this template carries no Mission-Control-specific concept
   * of its own. Rendered above the ship name, always visible regardless
   * of breakpoint (unlike the image, which hides on the narrowest
   * viewports — see below). */
  badge?: ReactNode
}

/**
 * @deprecated EWO-032 — RETIRED as of Beta 1.0. `ShipCard`
 * (src/components/ShipCard.tsx) is now the application's one canonical
 * Ship Card — Fleet Dashboard, Mission Control, and every future roadmap
 * consumer (Future Fleet Roadmap, Future Squadron Views) all render it.
 * This component's only remaining consumer, `PriorityCard`, is itself
 * retired. Kept in place, not deleted, pending Commander migration
 * verification — see docs/UI_ARCHITECTURE.md's canonical Ship Card
 * section for the full rationale (Sea Trials found this card wasted
 * screen space, presented less information, and required a secondary
 * "Ship Detail" hyperlink instead of a click-anywhere card).
 *
 * EWO-012 / EWO-012A / EWO-012B / EWO-013 — THE CANONICAL FLEET REGISTRY
 * RECORD (DA-010: "it is all one ship") for Strategic Fleet Manager,
 * pending Design Freeze visual acceptance (EWO-013). The vessel is a
 * dedicated decorative art layer, not a panel bolted onto a data card: it
 * is positioned toward the right of the record, allowed to overlap
 * negative space, and blended into the metadata field with a soft
 * mask-fade rather than a hard divider or a visible rectangular image
 * boundary. Operational metadata occupies the left field, always on top,
 * always legible.
 *
 * The art layer is intentionally decorative/non-interactive
 * (`pointer-events-none`, `select-none`, `aria-hidden`, empty `alt`) —
 * the ship's identity is already conveyed by the visible name text, so
 * the image is never separately announced to assistive tech.
 *
 * `presentation="cover"` is passed to ShipImage deliberately (not
 * "contain" or "auto"): ShipImage's own "contain" branch hard-codes a
 * centered `objectPosition` and an opaque background-color box, both
 * wrong for this right-anchored, boundary-free composition. Passing
 * "cover" keeps ShipImage on its other code path — which honors a
 * caller-supplied `objectPosition` and applies no background box — while
 * `imageClassName` below still forces the actual rendered image to
 * `object-contain`. This is the one placeholder-specific tuning EWO-012A
 * permits (sizing/positioning only, never manipulating the source PNG),
 * and it applies identically to any future transparent production ship
 * asset — no structural change is needed when real art arrives.
 *
 * EWO-013 audited the full Alpha 2.5D data contract available at this
 * component boundary (`Ship`, `buildName`, `BuildProgressResult`) and
 * tightened record height/padding to match only the fields that are
 * REQUIRED or CONDITIONAL today, rather than reserving space for
 * speculative fields (manufacturer, ownership, career, last-updated,
 * insurance) that are not part of the approved information hierarchy —
 * see docs/UI_ARCHITECTURE.md §8 for the full field audit.
 *
 * Deliberately generic (no "priority rank" or Mission-Control-only
 * concept baked in) so a future Fleet Dashboard ship card can reuse this
 * exact component — only the optional `badge` slot and caller-supplied
 * data differ between contexts. Fleet Dashboard adoption is a required
 * future migration (not done by this mission) once Design Freeze is
 * accepted — see docs/UI_ARCHITECTURE.md's UI migration backlog.
 */
export default function ShipRecordCard({ ship, buildName, progress, badge }: ShipRecordCardProps) {
  return (
    <div
      // EWO-013: heights tuned per the Alpha data-contract audit
      // (docs/UI_ARCHITECTURE.md §8) — the required + conditional field
      // set (badge?, name, role, loadout, readiness state, Ship Detail)
      // only needs ~170-180px of content height at these paddings; these
      // minimums retain modest headroom above that for the documented,
      // still-conditional progress-detail hardpoint without reserving a
      // full extra readiness-detail's worth of permanent empty space.
      className="group relative isolate overflow-hidden rounded-xl panel min-w-0 min-h-[220px] sm:min-h-[252px] lg:min-h-[268px] flex flex-col justify-center"
    >
      {/* Decorative art layer — the vessel. Right-anchored but inset from
          the top/bottom/right edges (EWO-012B) so it reads as breathing
          room rather than bleeding to the record's own boundary — this
          same inset also keeps opaque rectangular legacy photography
          (e.g. real ship CDN stills with no alpha channel) from presenting
          a harsh edge-to-edge box: the panel's own background now frames
          it on three sides regardless of whether the source image itself
          has transparency. Mask-faded on the left edge so it blends into
          the metadata field instead of ending in a hard seam. Sized down
          and further softened at the narrowest breakpoint so it reads as
          a restrained backdrop rather than competing with legibility. */}
      <div
        className="absolute inset-y-[10%] sm:inset-y-[9%] lg:inset-y-[8%] right-[2%] sm:right-[3%] lg:right-[4%] w-[40%] opacity-60 sm:w-[50%] sm:opacity-95 lg:w-[48%] pointer-events-none select-none"
        style={{
          maskImage: 'linear-gradient(to right, transparent 0%, black 45%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 45%)',
        }}
        aria-hidden="true"
      >
        <ShipImage
          src={ship.imageUrl}
          alt=""
          // The approved Fleet Registry placeholder (semantic system, never a
          // hard-coded path here) — EWO-012A's revised master: isolated
          // vessel art with a baked-in "IMAGE UNAVAILABLE / DATA LINK
          // PENDING" status treatment that object-fit: contain never crops.
          fallbackSrc={FLEET_REGISTRY_PLACEHOLDER ?? ''}
          className="absolute inset-0"
          imageClassName="block w-full h-full object-contain"
          objectPosition="right center"
          overlay={false}
          presentation="cover"
        />
      </div>

      {/* Content layer — metadata and actions, always on top, always legible.
          Future progress hardpoint (EWO-012B, position preserved by
          EWO-013): a compact secondary readiness/progress detail (e.g. a
          missing-component count) can be inserted here, directly below the
          existing Mission Ready/ReadinessBar block and above the Ship
          Detail action, without any structural change — this is the
          "optional secondary metadata" slot anticipated by EWO-012's
          information hierarchy. Per the EWO-013 Alpha data audit, no
          reserved space is held for it: it renders conditionally (only
          when real progress data justifies it) so the card contracts
          naturally in its absence, exactly as it does today. No such
          element is added by this mission; no data is invented. */}
      <div className="relative z-10 min-w-0 max-w-[78%] sm:max-w-[58%] p-3.5 sm:p-4 flex flex-col gap-1">
        {badge && <div className="mb-1">{badge}</div>}
        <h3 className="font-display font-semibold text-white text-base leading-tight truncate">{ship.name}</h3>
        <p className="text-xs text-muted truncate">{ship.role}</p>
        <p className="text-xs text-muted truncate">Loadout: {buildName}</p>
        {progress.isComplete ? (
          <div className="flex items-center gap-1.5 text-success text-xs font-semibold uppercase tracking-widest mt-1.5">
            <CheckCircle2 size={13} className="shrink-0" /> <span className="truncate">Mission Ready</span>
          </div>
        ) : (
          <div className="mt-1.5 min-w-0">
            <ReadinessBar value={progress.percentage} size="sm" />
          </div>
        )}
        <Link
          to={`/ship/${ship.id}`}
          className="mt-1.5 flex items-center gap-1 text-sm font-medium text-cyan hover:gap-1.5 transition-all min-w-0"
        >
          <span className="truncate">Ship Detail</span> <ArrowRight size={13} className="shrink-0" />
        </Link>
      </div>
    </div>
  )
}
