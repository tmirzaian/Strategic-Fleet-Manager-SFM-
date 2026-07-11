import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { Ship } from '../types'
import type { BuildProgressResult } from '../utils/buildProgress'
import ReadinessBar from './ReadinessBar'

export default function PriorityCard({ ship, buildName, rank, progress }: { ship: Ship; buildName: string; rank: number; progress: BuildProgressResult }) {
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
      {progress.isComplete ? (
        <div className="flex items-center gap-1.5 text-success text-xs font-semibold uppercase tracking-widest">
          <CheckCircle2 size={13} /> Mission Ready
        </div>
      ) : (
        <>
          <ReadinessBar value={progress.percentage} size="sm" />
          {(progress.missingAssignments.length > 0 || progress.upgradeOpportunities.length > 0) && (
            <p className="text-xs text-warning">Needs: {[...progress.missingAssignments, ...progress.upgradeOpportunities].join(', ')}</p>
          )}
        </>
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
