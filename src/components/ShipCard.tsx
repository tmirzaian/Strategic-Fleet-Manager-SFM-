import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, AlertOctagon, Settings2 } from 'lucide-react'
import type { Ship, FleetBuildState } from '../types'
import type { BuildProgressResult } from '../utils/buildProgress'
import ReadinessBar from './ReadinessBar'
import Badge, { ownershipTone } from './Badge'
import ShipImage, { type ShipImagePresentationMode } from './ShipImage'

export default function ShipCard({
  ship,
  buildName,
  progress,
  buildState,
}: {
  ship: Ship
  buildName: string
  progress: BuildProgressResult
  buildState: FleetBuildState
}) {
  const [mode, setMode] = useState<ShipImagePresentationMode>('cover')

  return (
    <Link
      to={`/ship/${ship.id}`}
      className="panel p-4 flex flex-col gap-3 hover:shadow-glow hover:border-cyan/30 transition-all group"
    >
      <ShipImage
        src={ship.imageUrl}
        alt={ship.name}
        className="aspect-video rounded-lg bg-black/40 border border-white/5 overflow-hidden relative"
        // Real photography keeps the hover-zoom cover treatment; branded
        // fallback artwork gets a plain, uncropped, non-zooming contain
        // presentation — letterboxed naturally against the dark background.
        imageClassName={mode === 'contain' ? 'block w-full h-full object-contain animate-ship-image-fade-in' : 'block w-full h-full object-cover group-hover:scale-105 transition-transform duration-300'}
        presentation="auto"
        onPresentationChange={setMode}
      />
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display font-semibold text-white leading-tight">{ship.name}</h3>
          <p className="text-xs text-muted mt-0.5">{ship.manufacturer} · {ship.role}</p>
        </div>
        <Badge tone={ownershipTone(ship.ownership)}>{ship.ownership}</Badge>
      </div>

      {buildState === 'INVALID_BUILD' ? (
        <div className="flex items-center gap-1.5 text-danger text-xs font-semibold uppercase tracking-widest">
          <AlertOctagon size={14} /> Invalid Build
        </div>
      ) : buildState === 'FACTORY_ONLY' ? (
        <>
          <div className="text-xs text-muted">
            Active Configuration: <span className="text-cyan/90 font-medium">Factory Loadout</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-cyan/80">
            <Settings2 size={13} /> No custom Build assigned yet
          </div>
        </>
      ) : buildState === 'MISSION_READY' ? (
        <>
          <div className="text-xs text-muted">
            Active Build: <span className="text-cyan/90 font-medium">{buildName}</span>
          </div>
          <div className="flex items-center gap-1.5 text-success text-xs font-semibold uppercase tracking-widest">
            <CheckCircle2 size={14} /> Mission Ready
          </div>
        </>
      ) : (
        <>
          <div className="text-xs text-muted">
            Active Build: <span className="text-cyan/90 font-medium">{buildName}</span>
          </div>
          <ReadinessBar value={progress.percentage} size="sm" />
          <div className="flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span className="line-clamp-1">
              Missing: {[...progress.missingAssignments, ...progress.upgradeOpportunities, ...progress.invalidTargets].join(', ')}
            </span>
          </div>
        </>
      )}
    </Link>
  )
}
