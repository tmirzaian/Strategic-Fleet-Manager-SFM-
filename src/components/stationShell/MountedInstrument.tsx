export interface MountedInstrumentProps {
  label: string
  value: string | number
  testId?: string
}

/**
 * EWO-109 (Part B/E) — the Mounted Instrument primitive, one of the three
 * QDS-004 Part G approved for extraction: a recessed dark housing, a thin
 * cyan structural hairline, and corner ticks matching the Quartermaster
 * Glyph Housing's own language (Flight-Commander-owned, not moved here —
 * Part E). Fully generic — `label`/`value` are plain strings/numbers, no
 * ship, fleet, or intelligence concept is known to this component.
 */
export default function MountedInstrument({ label, value, testId }: MountedInstrumentProps) {
  return (
    <div data-testid={testId} className="relative bg-black/30 backdrop-blur-md border border-white/10 rounded-md px-3 py-3 text-center overflow-hidden">
      <span className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan/50 to-transparent" aria-hidden="true" />
      <span className="pointer-events-none absolute top-0.5 left-0.5 w-1.5 h-1.5 border-t border-l border-cyan/25" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-0.5 right-0.5 w-1.5 h-1.5 border-b border-r border-cyan/25" aria-hidden="true" />
      <p className="text-2xl font-display font-bold text-gold leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-muted mt-1.5">{label}</p>
    </div>
  )
}
