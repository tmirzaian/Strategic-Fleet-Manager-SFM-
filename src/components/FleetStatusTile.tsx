import { Link } from 'react-router-dom'
import type { TileContextResult } from '../utils/tileContextNames'
import CriticalMetricTile from './CriticalMetricTile'

/**
 * A Mission Control Fleet Status tile that shows not just a count but
 * which Fleet Assets it represents (Alpha 2.5A Part 2 — the At-a-Glance
 * Rule: every metric should answer the player's immediate follow-up
 * question without another click). Names are clickable straight to Ship
 * Detail; "+N" links to Fleet Dashboard rather than adding a new
 * state-based filter there (out of scope this sprint).
 *
 * Built on the shared CriticalMetricTile scale (EWO-011) — this
 * component only adds the ship-name context list underneath.
 */
export default function FleetStatusTile({
  icon,
  label,
  count,
  accent,
  context,
}: {
  icon: any
  label: string
  count: number
  accent?: string
  context: TileContextResult
}) {
  return (
    <CriticalMetricTile icon={icon} label={label} value={count} accent={accent}>
      {context.shown.length > 0 && (
        <div className="text-[11px] text-muted/80 mt-1 truncate" title={context.shown.map((c) => c.name).join(', ')}>
          {context.shown.map((entry, i) => (
            <span key={entry.shipId}>
              {i > 0 && ' • '}
              <Link to={`/ship/${entry.shipId}`} className="hover:text-cyan hover:underline">
                {entry.name}
              </Link>
            </span>
          ))}
          {context.overflowCount > 0 && (
            <>
              {' '}
              <Link to="/fleet" className="hover:text-cyan hover:underline">
                +{context.overflowCount}
              </Link>
            </>
          )}
        </div>
      )}
    </CriticalMetricTile>
  )
}
