import type { ReactNode } from 'react'

/**
 * EWO-109 (Part B/C) — the Command Instrument Zone: a generic grid
 * container for `MountedInstrument` boxes. Owns only the grid mechanism
 * (columns, gap) — the number and content of instruments is entirely
 * Station-owned. Carries the `summary-cards` test id EWO-104/108's own
 * behavioral tests already depend on, preserved verbatim for visual and
 * behavioral parity (Part G/H).
 */
export default function MountedInstrumentRegion({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 w-full" data-testid="summary-cards">
      {children}
    </div>
  )
}
