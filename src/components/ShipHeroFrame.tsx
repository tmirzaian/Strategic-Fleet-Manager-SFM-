import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import Badge, { ownershipTone } from './Badge'
import ShipImage, { type ShipImagePresentationMode } from './ShipImage'
import ManufacturerLogo from './ManufacturerLogo'
import { deriveIsFallback } from '../utils/shipImageState'
import { DATA_LINK_PENDING_LABEL } from '../constants/shipImage'

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
   * only rendered for a genuinely completed custom Loadout. */
  isMissionReady?: boolean
  /** Sea Trial SW-001 (Rev 0.4) — overrides the identity subtitle line
   * entirely (used verbatim, no further concatenation). Omitted by every
   * existing caller (Ship Detail, ImportedShipDetail) which keeps the
   * original "{manufacturer} · Active Loadout: {activeBuildLabel}" text
   * unchanged — this is additive only. */
  subtitle?: string
}

/**
 * Shared hero used by Ship Detail's seed-driven and imported-ship
 * branches (Alpha 2.5C, Part 1). Layout:
 *   TOP-LEFT: manufacturer logo, above the ship identity block.
 *   TOP-RIGHT: intentionally empty — reserved for a future feature.
 *   BOTTOM-RIGHT: reserved for a future Mission Ready certification badge;
 *     only a restrained placeholder icon renders this sprint, and only
 *     for a completed custom Loadout.
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

  const certificationPlaceholder = isMissionReady && (
    <div className="absolute bottom-3 right-3 z-10" title="Mission Ready — Quartermaster certification badge reserved for a future release">
      <div className="w-8 h-8 rounded-full bg-black/50 border border-success/40 flex items-center justify-center backdrop-blur-sm">
        <ShieldCheck size={15} className="text-success/80" />
      </div>
    </div>
  )

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

        {/* Top-left: manufacturer logo, always present regardless of
            cover/fallback mode. Top-right stays deliberately empty. */}
        <div className="absolute top-3 left-3 z-10">
          <ManufacturerLogo manufacturer={manufacturer} />
        </div>

        {!isFallback && (
          <>
            <div className="absolute inset-0 bg-gradient-to-t from-panel via-panel/40 to-transparent" />
            <div data-testid="ship-hero-overlay-info" className="absolute bottom-4 left-5 right-5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-display font-bold text-white drop-shadow">{name}</h2>
                {badges}
              </div>
              <p className="text-sm text-white/80 mt-1 drop-shadow">{subtitleText}</p>
            </div>
            {certificationPlaceholder}
          </>
        )}
        {isFallback && certificationPlaceholder}
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
