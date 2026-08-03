import type { LucideIcon } from 'lucide-react'

export interface QuartermasterIconHousingProps {
  icon: LucideIcon
  label: string
  /** Whether this icon is currently the "lit" state (gold, glowing) vs. the restrained cyan-bordered resting state. The caller decides what "active" means — this component has no domain opinion (matched-category, selected-tool, enabled-toggle, or any other boolean are all valid callers). */
  active?: boolean
  size?: 'sm' | 'md'
}

/**
 * EWO-110 (Part H) — the canonical Quartermaster icon housing: every
 * mounted icon in Quartermaster Edition should read as
 *
 *   [ recessed housing ]
 *         icon
 *
 * rather than a bare Lucide glyph floating on its own. Not new icons —
 * every existing icon set (`componentCategoryIcon.ts` and any other
 * existing glyph table) keeps its own meaning; this only changes how a
 * glyph is *mounted*.
 *
 * Generalizes Flight Commander's own EWO-108 `QuartermasterGlyphFrame`
 * (which took a `matched: boolean` specific to category-match state) —
 * this component takes the same recessed/corner-tick/gold-vs-cyan
 * housing language with a generic `active: boolean`, so any future
 * Station's own on/off icon state can reuse it without inventing a
 * second near-identical housing.
 */
export default function QuartermasterIconHousing({ icon: Icon, label, active = false, size = 'md' }: QuartermasterIconHousingProps) {
  const boxSize = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7'
  const iconSize = size === 'sm' ? 12 : 14
  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className={`relative shrink-0 flex items-center justify-center ${boxSize} rounded-[3px] border transition-colors ${
        active ? 'border-gold/50 bg-gold/10 text-gold shadow-[0_0_6px_rgba(201,162,39,0.35)]' : 'border-cyan/15 bg-black/25 text-muted/40'
      }`}
    >
      <span className="pointer-events-none absolute -top-px -left-px w-1.5 h-1.5 border-t border-l border-current opacity-50" aria-hidden="true" />
      <span className="pointer-events-none absolute -bottom-px -right-px w-1.5 h-1.5 border-b border-r border-current opacity-50" aria-hidden="true" />
      <Icon size={iconSize} aria-hidden="true" />
    </div>
  )
}
