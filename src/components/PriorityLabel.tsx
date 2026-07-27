import type { ReactNode } from 'react'

/**
 * EWO-033 (Design Authority Ruling 2/3) — Priority is page-level wrapper
 * context, never embedded inside the canonical `ShipCard` itself. Shared
 * between Fleet Dashboard (every card, showing that Fleet Asset's own
 * stored `priority` value) and Mission Control (the Top 4 slice, showing
 * positional rank 1-4) so both pages use one identical wrapper treatment
 * rather than two page-specific hard-coded variants (Ruling 9).
 *
 * EWO-066 (Part E) — `rank: null` ("Unprioritized," Fleet Dashboard's own
 * usage only; Mission Control's Top 4 slice always passes a real
 * positional 1-4 rank, never null) renders the same wrapper with muted
 * "UNPRIORITIZED" text instead of a number — still a label, never an
 * empty/missing state.
 */
export default function PriorityLabel({ rank, children }: { rank: number | null; children: ReactNode }) {
  return (
    <div data-testid="priority-card-wrapper" className="flex flex-col gap-2 h-full">
      <span className={`font-mono text-[10px] tracking-widest ${rank === null ? 'text-muted/60' : 'text-cyan/80'}`}>
        {rank === null ? 'UNPRIORITIZED' : `PRIORITY ${rank}`}
      </span>
      {children}
    </div>
  )
}
