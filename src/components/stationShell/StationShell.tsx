import type { ReactNode } from 'react'

/**
 * EWO-109 (Part B/C) — the Quartermaster Station Shell's outermost
 * wrapper. This is the Station Threshold in its most conservative form
 * (QDS-004 Open Question #4, resolved conservatively here): no new
 * visible element was invented — the threshold is structural/positional
 * only, the same outer `space-y-4 max-w-5xl` shape Flight Commander
 * already used, now owned by the shell instead of the page.
 *
 * Knows nothing about ships, readiness, inventory, procurement,
 * intelligence, maintenance, history, or reservations — see
 * `src/components/stationShell/__tests__/StationShell.test.tsx` for a
 * direct, automated proof of that independence.
 */
export default function StationShell({ children }: { children: ReactNode }) {
  return <div className="space-y-4 max-w-5xl">{children}</div>
}
