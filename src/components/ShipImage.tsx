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
 * Adaptive presentation (Sprint 1.3H): branded fallback artwork is a
 * complete composition, not a photo to crop — it renders with
 * object-contain, centered, on a flat dark background, with no overlay
 * and a brief fade-in, while real ship photography keeps the original
 * object-cover + gradient-overlay treatment. Pages never decide this
 * themselves; they only react to `onPresentationChange`.
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

  if (hardFailed) {
    return (
      <div className={className}>
        <div className="w-full h-full flex items-center justify-center bg-black/40">
          <ShipWheel className="text-muted/30" size={40} strokeWidth={1.2} />
        </div>
      </div>
    )
  }

  // Fallback artwork is a complete branded composition: shown in full
  // (object-contain) on a flat dark background, centered, with no
  // gradient overlay on top of it — real ship photography keeps the
  // original cover + overlay treatment.
  const resolvedImageClassName =
    imageClassName ?? (mode === 'contain' ? 'block w-full h-full object-contain animate-ship-image-fade-in' : 'block w-full h-full object-cover')

  return (
    <div className={className} style={mode === 'contain' ? { backgroundColor: '#071016' } : undefined}>
      <img
        src={state.effectiveSrc}
        alt={alt}
        onError={handleError}
        className={resolvedImageClassName}
        style={{ objectPosition: mode === 'contain' ? 'center' : objectPosition }}
      />
      {overlay && mode === 'cover' && <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />}
    </div>
  )
}
