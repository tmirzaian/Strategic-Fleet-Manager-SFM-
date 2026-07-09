import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { Ship } from '../types'
import ReadinessBar from './ReadinessBar'

export default function PriorityCard({ ship, buildName, rank }: { ship: Ship; buildName: string; rank: number }) {
  return (
    <div className="panel p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-cyan/80 tracking-widest">PRIORITY {rank}</span>
        <span className="text-[11px] text-muted">{ship.role}</span>
      </div>
      <div>
        <h3 className="font-display font-semibold text-white text-lg leading-tight">{ship.name}</h3>
        <p className="text-xs text-muted mt-0.5">Build: {buildName}</p>
      </div>
      <ReadinessBar value={ship.readiness} size="sm" />
      {ship.missing.length > 0 && (
        <p className="text-xs text-warning">Needs: {ship.missing.join(', ')}</p>
      )}
      <Link
        to={`/ship/${ship.id}`}
        className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-cyan hover:gap-2.5 transition-all"
      >
        Ship Detail <ArrowRight size={15} />
      </Link>
    </div>
  )
}
