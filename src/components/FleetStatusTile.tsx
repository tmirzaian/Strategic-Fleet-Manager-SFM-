import { Link } from 'react-router-dom'
import type { TileContextResult } from '../utils/tileContextNames'

/**
 * A Mission Control Fleet Status tile that shows not just a count but
 * which Fleet Assets it represents (Alpha 2.5A Part 2 — the At-a-Glance
 * Rule: every metric should answer the player's immediate follow-up
 * question without another click). Names are clickable straight to Ship
 * Detail; "+N" links to Fleet Dashboard rather than adding a new
 * state-based filter there (out of scope this sprint).
 */
export default function FleetStatusTile({
  icon: Icon,
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
    <div className="panel p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-lg bg-cyan/10 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-cyan" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-display font-bold leading-none" style={accent ? { color: accent } : undefined}>
          {count}
        </div>
        <div className="text-[11px] uppercase tracking-widest text-muted mt-1">{label}</div>
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
      </div>
    </div>
  )
}
