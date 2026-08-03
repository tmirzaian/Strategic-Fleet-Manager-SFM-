/**
 * EWO-110 (Part F) — the Environmental Overlay Library. Every overlay
 * here is `aria-hidden`, `pointer-events-none`, absolutely positioned
 * (`inset-0` within its nearest positioned ancestor), and renders no
 * text or data of any kind — pure atmosphere, never information, per
 * the work order's own explicit rule. None of these are mounted
 * anywhere by default; a Station opts in per-surface.
 */

function overlayBase(className: string) {
  return `pointer-events-none absolute inset-0 overflow-hidden ${className}`
}

/** A faint repeating grid, suggesting a technical/blueprint schematic surface. */
export function BlueprintGridOverlay({ opacity = 0.05 }: { opacity?: number }) {
  return (
    <div
      aria-hidden="true"
      className={overlayBase('')}
      style={{
        opacity,
        backgroundImage: 'linear-gradient(rgba(53,208,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(53,208,255,1) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    />
  )
}

/** Concentric targeting-style rings, off-center — a tactical/sensor motif. */
export function TacticalCirclesOverlay({ opacity = 0.08 }: { opacity?: number }) {
  return (
    <div aria-hidden="true" className={overlayBase('')} style={{ opacity }}>
      <div className="absolute -left-16 -bottom-16 w-64 h-64 rounded-full border border-cyan" />
      <div className="absolute -left-8 -bottom-8 w-40 h-40 rounded-full border border-cyan" />
      <div className="absolute left-8 bottom-8 w-16 h-16 rounded-full border border-cyan" />
    </div>
  )
}

/** Small corner tick/measurement marks at each edge — a drafting/engineering annotation motif. */
export function EngineeringMarksOverlay({ opacity = 0.15 }: { opacity?: number }) {
  return (
    <div aria-hidden="true" className={overlayBase('')} style={{ opacity }}>
      <span className="absolute top-3 left-3 w-3 h-3 border-t border-l border-white" />
      <span className="absolute top-3 right-3 w-3 h-3 border-t border-r border-white" />
      <span className="absolute bottom-3 left-3 w-3 h-3 border-b border-l border-white" />
      <span className="absolute bottom-3 right-3 w-3 h-3 border-b border-r border-white" />
    </div>
  )
}

/** Subtle repeating horizontal scan-line texture — a display/hologram motif. */
export function ScanLinesOverlay({ opacity = 0.04 }: { opacity?: number }) {
  return (
    <div
      aria-hidden="true"
      className={overlayBase('')}
      style={{ opacity, backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,1) 0px, transparent 1px, transparent 3px)' }}
    />
  )
}

/** A bordered frame with bracket-style corners — reads as a mounted compartment boundary rather than a plain CSS border. */
export function CompartmentFrameOverlay({ opacity = 0.4 }: { opacity?: number }) {
  return (
    <div aria-hidden="true" className={overlayBase('')} style={{ opacity }}>
      <span className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-cyan/60 rounded-tl-md" />
      <span className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyan/60 rounded-tr-md" />
      <span className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-cyan/60 rounded-bl-md" />
      <span className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-cyan/60 rounded-br-md" />
    </div>
  )
}

/** A restrained radial glow suggesting depth behind mounted content — never a spotlight, never attention-grabbing. */
export function HolographicDepthOverlay({ opacity = 0.5 }: { opacity?: number }) {
  return (
    <div
      aria-hidden="true"
      className={overlayBase('')}
      style={{ opacity, background: 'radial-gradient(circle at 50% 30%, rgba(53,208,255,0.12), transparent 60%)' }}
    />
  )
}
