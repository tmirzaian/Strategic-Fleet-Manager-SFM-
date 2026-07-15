import type { ReactNode } from 'react'

/**
 * EWO-033 (Design Authority Ruling 2/3) — Priority is page-level wrapper
 * context, never embedded inside the canonical `ShipCard` itself. Shared
 * between Fleet Dashboard (every card, showing that Fleet Asset's own
 * stored `priority` value) and Mission Control (the Top 4 slice, showing
 * positional rank 1-4) so both pages use one identical wrapper treatment
 * rather than two page-specific hard-coded variants (Ruling 9).
 */
export default function PriorityLabel({ rank, children }: { rank: number; children: ReactNode }) {
  return (
    <div data-testid="priority-card-wrapper" className="flex flex-col gap-2 h-full">
      <span className="font-mono text-[10px] text-cyan/80 tracking-widest">PRIORITY {rank}</span>
      {children}
    </div>
  )
}
