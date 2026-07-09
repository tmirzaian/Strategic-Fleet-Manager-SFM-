import { Link } from 'react-router-dom'
import { ShipWheel, AlertTriangle } from 'lucide-react'
import type { Ship } from '../types'
import ReadinessBar from './ReadinessBar'
import Badge, { ownershipTone } from './Badge'

export default function ShipCard({ ship, buildName }: { ship: Ship; buildName: string }) {
  return (
    <Link
      to={`/ship/${ship.id}`}
      className="panel p-4 flex flex-col gap-3 hover:shadow-glow hover:border-cyan/30 transition-all group"
    >
      <div className="aspect-video rounded-lg bg-black/40 border border-white/5 flex items-center justify-center overflow-hidden">
        <ShipWheel className="text-muted/40 group-hover:text-cyan/40 transition-colors" size={40} />
      </div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display font-semibold text-white leading-tight">{ship.name}</h3>
          <p className="text-xs text-muted mt-0.5">{ship.manufacturer} · {ship.role}</p>
        </div>
        <Badge tone={ownershipTone(ship.ownership)}>{ship.ownership}</Badge>
      </div>
      <div className="text-xs text-muted">
        Active Build: <span className="text-cyan/90 font-medium">{buildName}</span>
      </div>
      <ReadinessBar value={ship.readiness} size="sm" />
      {ship.missing.length > 0 ? (
        <div className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="line-clamp-1">Missing: {ship.missing.join(', ')}</span>
        </div>
      ) : (
        <div className="text-xs text-success">Build complete</div>
      )}
    </Link>
  )
}
