export type StructuralDividerVariant = 'horizontal' | 'vertical' | 'mounted' | 'section-break'

export interface StructuralDividerProps {
  variant?: StructuralDividerVariant
  /** Only used by the `section-break` variant — an optional short label centered on the break, e.g. "INTELLIGENCE STATUS." */
  label?: string
  testId?: string
}

/**
 * EWO-110 (Part C) — reusable compartment dividers modeled on industrial
 * bulkheads, never a flat HTML `<hr>`/border. Every variant fades at its
 * own edges (a seam disappearing into the surrounding material) rather
 * than terminating in a hard, drawn line.
 *
 * The `horizontal` variant reuses the app's own existing
 * `.scanline-divider` CSS class (`src/index.css`, already shipped and in
 * use on `EditFleetAssetModal`/`ShipDetail`/`MissionComposer`) rather
 * than duplicating its cyan gradient by hand — exactly the kind of
 * accidental parallel vocabulary QDS-002/QDS-003 both flagged as a
 * recurring risk elsewhere in the app. The other three variants extend
 * the same cyan-gradient language for visual consistency with it.
 */
export default function StructuralDivider({ variant = 'horizontal', label, testId }: StructuralDividerProps) {
  if (variant === 'vertical') {
    return <div data-testid={testId ?? 'structural-divider'} className="w-px self-stretch bg-gradient-to-b from-transparent via-cyan/40 to-transparent" aria-hidden="true" />
  }

  if (variant === 'mounted') {
    return (
      <div data-testid={testId ?? 'structural-divider'} className="relative scanline-divider my-3" aria-hidden="true">
        {/* A small structural node at the seam's center — a rivet/bolt mark, purely decorative. */}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border border-cyan/30 bg-black/40" />
      </div>
    )
  }

  if (variant === 'section-break') {
    return (
      <div data-testid={testId ?? 'structural-divider'} className="flex items-center gap-3 my-4" role={label ? 'separator' : undefined} aria-label={label}>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-cyan/25" aria-hidden="true" />
        {label && <span className="text-[10px] uppercase tracking-widest text-muted shrink-0">{label}</span>}
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-cyan/25" aria-hidden="true" />
      </div>
    )
  }

  // horizontal (default) — the app's own existing shipped divider class.
  return <div data-testid={testId ?? 'structural-divider'} className="scanline-divider" aria-hidden="true" />
}
