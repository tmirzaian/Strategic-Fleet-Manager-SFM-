import type { LucideIcon } from 'lucide-react'

/**
 * EWO-108 (Part I) — Quartermaster Iconography Prototype.
 *
 * A structural housing around an existing Lucide category glyph (never a
 * new taxonomy — `Icon`/`label` always come from
 * `CANONICAL_COMPONENT_CATEGORY_ICON`/`CANONICAL_COMPONENT_CATEGORY_LABEL`,
 * componentCategoryIcon.ts). This is a presentation prototype scoped to
 * Flight Commander only (Part P — not extracted to `src/components/`,
 * not consumed by any other page); see FlightCommander.tsx's own
 * completion-report notes on what proved reusable.
 *
 * `matched` is the only state this component knows about — a recessed,
 * dim cyan-bordered frame when false, a lit gold-bordered frame with a
 * soft glow when true. It never encodes readiness/validity/warning
 * semantics; those remain the exclusive province of the existing
 * Badge/STATUS_PILL system elsewhere in the app.
 */
export default function QuartermasterGlyphFrame({
  Icon,
  label,
  matched,
  size = 'md',
}: {
  Icon: LucideIcon
  label: string
  matched: boolean
  size?: 'sm' | 'md'
}) {
  const boxSize = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7'
  const iconSize = size === 'sm' ? 12 : 14
  return (
    <div
      role="img"
      aria-label={matched ? `${label} match` : `${label} not matched`}
      title={label}
      className={`relative shrink-0 flex items-center justify-center ${boxSize} rounded-[3px] border transition-colors ${
        matched ? 'border-gold/50 bg-gold/10 text-gold shadow-[0_0_6px_rgba(201,162,39,0.35)]' : 'border-cyan/15 bg-black/25 text-muted/40'
      }`}
    >
      {/* Recessed equipment-category frame — corner ticks read as
          instrument-panel housing rather than a plain bordered box. */}
      <span className="pointer-events-none absolute -top-px -left-px w-1.5 h-1.5 border-t border-l border-current opacity-50" aria-hidden="true" />
      <span className="pointer-events-none absolute -bottom-px -right-px w-1.5 h-1.5 border-b border-r border-current opacity-50" aria-hidden="true" />
      <Icon size={iconSize} aria-hidden="true" />
    </div>
  )
}
