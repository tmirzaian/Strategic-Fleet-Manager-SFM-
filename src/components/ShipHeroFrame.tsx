import { useState } from 'react'
import { ShieldCheck, Settings } from 'lucide-react'
import Badge, { ownershipTone } from './Badge'
import ShipImage, { type ShipImagePresentationMode } from './ShipImage'
import ManufacturerLogo from './ManufacturerLogo'
import { deriveIsFallback } from '../utils/shipImageState'
import { DATA_LINK_PENDING_LABEL } from '../constants/shipImage'

/** EWO-065 (Part F) — the upgraded Quartermaster Completion Seal's own
 * text content, supplied by the caller (Ship Management only — see
 * `onOpenSettings`/`quartermasterSeal` doc comments below for why this
 * is opt-in rather than a blanket behavior change). */
export interface QuartermasterSealContent {
  headline: string
  detail: string
}

export interface ShipHeroFrameProps {
  imageSrc?: string
  imageMeta?: { source?: string; status?: string }
  name: string
  manufacturer: string
  ownership: string
  activeBuildLabel: string
  imported?: boolean
  /** Reserves a restrained bottom-right placeholder for the future SFM
   * Quartermaster certification badge — no final artwork this sprint,
   * only rendered for a genuinely completed custom Loadout. Still used
   * verbatim by Ship Detail/ImportedShipDetail, which EWO-065 does not
   * touch; Ship Management now uses `quartermasterSeal` instead (a
   * stricter, richer replacement — see that prop's own doc comment). */
  isMissionReady?: boolean
  /** EWO-065 (Part F) — opt-in richer replacement for the plain
   * `isMissionReady` shield-check placeholder: a labeled medallion block
   * (glyph + headline + detail line) rather than an icon alone. Only Ship
   * Management passes this (via `reviewedSummary.isFullyCompletedCustomLoadout`,
   * a strictly narrower condition than `isMissionReady`'s own
   * `buildState === 'MISSION_READY'` — the latter also true for a
   * Factory-only ship or an entirely empty custom Build, both of which
   * Part E explicitly excludes from earning this seal). `null`/omitted
   * renders nothing here; Ship Detail/ImportedShipDetail don't pass it
   * and keep their existing `isMissionReady` treatment unchanged — this
   * mission is explicitly scoped to the Ship Management Hero only, not a
   * redesign of every Hero consumer. Renders instead of (never alongside)
   * `isMissionReady`'s own placeholder — no caller passes both. */
  quartermasterSeal?: QuartermasterSealContent | null
  /** EWO-065 (Part A) — when supplied, replaces the top-left manufacturer
   * abbreviation plate with a Ship Settings control that calls this on
   * click; the manufacturer name already appears on the identity
   * subtitle line below, so nothing is lost by retiring the corner badge
   * where this prop is used. Omitted (Ship Detail/ImportedShipDetail)
   * keeps the original `ManufacturerLogo` corner badge exactly as before
   * — Part A scopes this to the Ship Management Hero only. */
  onOpenSettings?: () => void
  /** Sea Trial SW-001 (Rev 0.4) — overrides the identity subtitle line
   * entirely (used verbatim, no further concatenation). Omitted by every
   * existing caller (Ship Detail, ImportedShipDetail) which keeps the
   * original "{manufacturer} · Active Loadout: {activeBuildLabel}" text
   * unchanged — this is additive only. */
  subtitle?: string
}

/**
 * Shared hero used by Ship Detail's seed-driven and imported-ship
 * branches (Alpha 2.5C, Part 1), and by Ship Management
 * (`ShipWorkspacePrototype.tsx`). Layout:
 *   TOP-LEFT: manufacturer logo, above the ship identity block — or
 *     (EWO-065 Part A, opt-in via `onOpenSettings`) a Ship Settings
 *     control, currently only Ship Management passes this.
 *   TOP-RIGHT: intentionally empty — reserved for a future feature.
 *   BOTTOM-RIGHT: `isMissionReady`'s restrained placeholder icon, or
 *     (EWO-065 Part F, opt-in via `quartermasterSeal`) the richer
 *     Quartermaster Completion Seal — currently only Ship Management
 *     passes the latter; the two are mutually exclusive per caller.
 * No readiness bar renders here at all anymore — Readiness lives in the
 * information panel below (Part 1/2).
 *
 * Still adapts automatically between real photography (cover + overlay)
 * and Data Link Pending fallback artwork (contain + metadata band),
 * exactly as before.
 */
export default function ShipHeroFrame({
  imageSrc,
  imageMeta,
  name,
  manufacturer,
  ownership,
  activeBuildLabel,
  imported = false,
  isMissionReady = false,
  quartermasterSeal = null,
  onOpenSettings,
  subtitle,
}: ShipHeroFrameProps) {
  const [mode, setMode] = useState<ShipImagePresentationMode>(() => (deriveIsFallback(!imageSrc, imageMeta) ? 'contain' : 'cover'))
  const isFallback = mode === 'contain'
  const subtitleText = subtitle ?? `${manufacturer} · Active Loadout: ${activeBuildLabel}`

  const badges = (
    <>
      <Badge tone={ownershipTone(ownership)}>{ownership}</Badge>
      {imported && <Badge tone="cyan">Imported</Badge>}
    </>
  )

  // EWO-065 (Part A) — Ship Settings replaces the manufacturer plate only
  // where a caller opts in; the manufacturer name still appears on the
  // identity subtitle line below regardless, so nothing is lost.
  const topLeftControl = onOpenSettings ? (
    <button
      type="button"
      onClick={onOpenSettings}
      title="Ship Settings"
      aria-label="Ship Settings"
      className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 bg-black/50 border border-white/15 backdrop-blur-sm rounded-md px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/80 hover:text-white hover:border-white/35 transition-colors"
    >
      <Settings size={12} /> Ship Settings
    </button>
  ) : (
    <div className="absolute top-3 left-3 z-10">
      <ManufacturerLogo manufacturer={manufacturer} />
    </div>
  )

  const certificationPlaceholder = isMissionReady && (
    <div className="absolute bottom-3 right-3 z-10" title="Mission Ready — Quartermaster certification badge reserved for a future release">
      <div className="w-8 h-8 rounded-full bg-black/50 border border-success/40 flex items-center justify-center backdrop-blur-sm">
        <ShieldCheck size={15} className="text-success/80" />
      </div>
    </div>
  )

  // EWO-065 (Part F) / EWO-065A (Part C) — the Quartermaster Completion
  // Seal: a deliberate, restrained accomplishment block (glyph +
  // headline + detail), not a loot-badge icon alone. Renders instead of
  // `certificationPlaceholder` in the same corner — a caller supplies one
  // or the other, never both. Border/glow/label are Quartermaster Gold
  // (recognition and certification, never caution) — the shield/check
  // glyph itself stays green, communicating "complete" independently of
  // the gold "certified" framing around it; the two colors deliberately
  // carry two different meanings on the same block. `title` exposes the
  // full supporting text via native tooltip whenever `truncate` clips it.
  const quartermasterSealBlock = quartermasterSeal && (
    <div
      data-testid="quartermaster-completion-seal"
      className="absolute bottom-3 right-3 z-10 flex items-center gap-2 bg-black/60 border border-gold/50 shadow-[0_0_16px_rgba(201,162,39,0.3)] backdrop-blur-sm rounded-lg px-3 py-2 max-w-[min(80%,20rem)]"
      title={quartermasterSeal.detail}
    >
      <div className="w-8 h-8 rounded-full bg-success/10 border border-success/50 flex items-center justify-center shrink-0">
        <ShieldCheck size={16} className="text-success" />
      </div>
      <div className="leading-tight min-w-0">
        <div className="text-[10px] font-display font-bold tracking-wide text-gold truncate">{quartermasterSeal.headline}</div>
        <div className="text-[10px] text-white/70 truncate">{quartermasterSeal.detail}</div>
      </div>
    </div>
  )
  const accomplishmentBlock = quartermasterSealBlock || certificationPlaceholder

  return (
    <>
      {/* EWO-033A (Task 5) — one fixed hero height regardless of image
          availability (was h-[360px] for the fallback vs h-44 sm:h-56 for
          a real photo, the exact cause of Sea Trials' "oversized blank
          hero region" finding). The fallback artwork's own text/silhouette
          survive this shorter frame fine now that it fills it via
          object-cover instead of being letterboxed inside a taller box. */}
      <div data-testid="ship-hero-image-area" className="relative bg-black/40 border-b border-white/5 overflow-hidden h-44 sm:h-56">
        <ShipImage
          src={imageSrc}
          image={imageMeta}
          alt={name}
          className="absolute inset-0"
          overlay={false}
          presentation="auto"
          onPresentationChange={setMode}
        />

        {/* Top-left: manufacturer logo, or (EWO-065 Part A) the Ship
            Settings control when a caller opts in. Top-right stays
            deliberately empty. */}
        {topLeftControl}

        {!isFallback && (
          <>
            {/* EWO-095A — localized to the bottom half only (where the
                name/badges/subtitle actually sit), not the full `inset-0`
                hero: the gradient starts from `transparent` at its own top
                edge, exactly matching the (also transparent) unshaded
                upper half above it, so there is no visible seam — only the
                text-overlay region is ever darkened, never the whole
                image. */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-panel via-panel/40 to-transparent" />
            <div data-testid="ship-hero-overlay-info" className="absolute bottom-4 left-5 right-5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-display font-bold text-white drop-shadow">{name}</h2>
                {badges}
              </div>
              <p className="text-sm text-white/80 mt-1 drop-shadow">{subtitleText}</p>
            </div>
            {accomplishmentBlock}
          </>
        )}
        {isFallback && accomplishmentBlock}
      </div>

      {/* Metadata band — only rendered for fallback artwork, so the
          branded composition above never has text sitting on top of it. */}
      {isFallback && (
        <div data-testid="ship-hero-metadata-band" className="px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-display font-bold text-white">{name}</h2>
            {badges}
            <span className="text-[10px] uppercase tracking-widest text-cyan/60 font-mono">{DATA_LINK_PENDING_LABEL}</span>
          </div>
          <p className="text-sm text-muted mt-1">{subtitleText}</p>
        </div>
      )}
    </>
  )
}
