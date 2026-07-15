import { useEffect, useState } from 'react'
import { ShipWheel } from 'lucide-react'
import { SHIP_PLACEHOLDER_URL } from '../constants/shipImage'
import { initialShipImageState, onShipImageError, deriveIsFallback, type ShipImageState } from '../utils/shipImageState'

export type ShipImagePresentationMode = 'cover' | 'contain'

export interface ShipImageProps {
  src?: string
  alt: string
  className?: string
  imageClassName?: string
  /** Dark gradient overlay so text stays readable over the image. Defaults
   * to on, but is always suppressed for fallback artwork — see
   * "Adaptive Placeholder Presentation" below. */
  overlay?: boolean
  fallbackSrc?: string
  objectPosition?: string
  /** Optional metadata (source/status) so fallback detection doesn't have
   * to wait for a failed image load — an imported ship with no real photo
   * can be known as fallback up front. Never inspected as URL text. */
  image?: { source?: string; status?: string }
  /** 'auto' (default) picks cover for real photography and contain for
   * branded fallback artwork; 'cover'/'contain' force a mode regardless. */
  presentation?: ShipImagePresentationMode | 'auto'
  /** Notified whenever the effective presentation mode changes — including
   * the case where a real photo fails to load at runtime and this
   * degrades to contain — so a page can adapt its own layout (hero
   * height, metadata placement) from the same single source of truth
   * rather than re-deriving fallback status itself. */
  onPresentationChange?: (mode: ShipImagePresentationMode) => void
}

/**
 * Reusable ship image with a guaranteed-safe fallback chain:
 *   1. `src`, when present
 *   2. `fallbackSrc` (defaults to the local SHIP_PLACEHOLDER_URL), when
 *      `src` is missing OR fails to load
 * Never renders a browser broken-image icon — a missing/failed remote
 * image always resolves to the local placeholder instead, and a single
 * `usingFallback` guard prevents any possibility of an error loop even if
 * the fallback asset itself can't load (see src/utils/shipImageState.ts
 * for the underlying pure state machine, unit tested independently of
 * this component).
 *
 * Adaptive presentation (Sprint 1.3H, frame-filling behavior corrected
 * EWO-033A): both real ship photography and the branded fallback artwork
 * render with `object-cover`, centered — the fallback asset
 * (`SHIP_PLACEHOLDER_URL`, a square 1024×1024 composition with its
 * "IMAGE UNAVAILABLE / DATA LINK PENDING" text and ship silhouette both
 * confined to the vertical-center band) survives a centered cover-crop
 * into any wider frame without cutting off that text — confirmed by
 * direct visual inspection (EWO-033A, Task 3/4). This replaced the
 * original `object-contain` + flat-background-color treatment, which
 * left a large, empty letterboxed region in any frame wider than the
 * asset's own 1:1 aspect ratio (the exact "oversized blank region"
 * Sea Trials flagged on Ship Detail's hero). No overlay is still applied
 * on top of the fallback (see below), so its own text stays fully crisp
 * — "frame-filling," not "photographed and darkened." Pages never decide
 * this themselves; they only react to `onPresentationChange`.
 *
 * Use this anywhere a ship image renders — Fleet Dashboard cards, Ship
 * Detail's hero, any future ship image view — rather than a raw <img>.
 */
export default function ShipImage({
  src,
  alt,
  className,
  imageClassName,
  overlay = true,
  fallbackSrc = SHIP_PLACEHOLDER_URL,
  objectPosition = 'center',
  image,
  presentation = 'auto',
  onPresentationChange,
}: ShipImageProps) {
  const [state, setState] = useState<ShipImageState>(() => initialShipImageState(src, fallbackSrc))
  const [hardFailed, setHardFailed] = useState(false)

  // Re-derive initial state when the requested src changes (e.g. switching
  // ships) rather than sticking with a previous ship's fallen-back state.
  useEffect(() => {
    setState(initialShipImageState(src, fallbackSrc))
    setHardFailed(false)
  }, [src, fallbackSrc])

  const handleError = () => {
    const next = onShipImageError(state, fallbackSrc)
    if (next === state) {
      // Already on the fallback and it still failed — stop trying to
      // render an <img> at all rather than looping, and show the inline
      // icon fallback instead.
      setHardFailed(true)
      return
    }
    setState(next)
  }

  const isFallback = presentation === 'auto' ? deriveIsFallback(state.usingFallback, image) : presentation === 'contain'
  const mode: ShipImagePresentationMode = isFallback ? 'contain' : 'cover'

  useEffect(() => {
    onPresentationChange?.(mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // A caller can explicitly pass fallbackSrc="" (e.g. the approved Fleet
  // Registry placeholder not being delivered yet) to say "there is
  // genuinely no image to show" — never attempt to load an empty <img
  // src>, just render the same neutral icon treatment as a hard failure.
  const hasNoImageSource = (!src || src.trim() === '') && (!fallbackSrc || fallbackSrc.trim() === '')

  if (hardFailed || hasNoImageSource) {
    return (
      <div className={className}>
        <div className="w-full h-full flex items-center justify-center bg-black/40">
          <ShipWheel className="text-muted/30" size={40} strokeWidth={1.2} />
        </div>
      </div>
    )
  }

  // EWO-033A (Task 4) — both real photography and the branded fallback
  // composition now fill the frame with a centered object-cover crop
  // (never distorted/stretched) — the fallback artwork's own "IMAGE
  // UNAVAILABLE" text and ship silhouette sit within its vertical-center
  // band, confirmed by direct visual inspection to survive any reasonable
  // cover-crop. No gradient overlay renders on top of the fallback
  // (unchanged from before) so its own text stays fully legible; real
  // photography keeps its overlay via the `overlay` prop below. A brief
  // fade-in still plays only when the fallback first appears.
  const resolvedImageClassName =
    imageClassName ?? (mode === 'contain' ? 'block w-full h-full object-cover animate-ship-image-fade-in' : 'block w-full h-full object-cover')

  return (
    <div className={className}>
      <img
        src={state.effectiveSrc}
        alt={alt}
        onError={handleError}
        className={resolvedImageClassName}
        style={{ objectPosition }}
      />
      {overlay && mode === 'cover' && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />}
    </div>
  )
}
