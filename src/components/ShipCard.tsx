import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, AlertOctagon, Settings2 } from 'lucide-react'
import type { Ship, FleetBuildState } from '../types'
import type { BuildProgressResult } from '../utils/buildProgress'
import ReadinessBar from './ReadinessBar'
import Badge, { ownershipTone } from './Badge'
import ShipImage, { type ShipImagePresentationMode } from './ShipImage'
import { formatShipIdentityLine } from '../utils/shipIdentityLine'
import { useResolvedShipImage } from '../utils/useResolvedShipImage'

/**
 * EWO-032 — THE CANONICAL SHIP CARD for Strategic Fleet Manager (Beta
 * 1.0). Originally Fleet Dashboard-only; Sea Trials found it the
 * application's strongest information presentation (Ship Image, Name,
 * Manufacturer, Ownership Badge, Active Loadout, Readiness %, Missing
 * Component Warning, Progress Bar, all in one click-anywhere-to-navigate
 * card), so Mission Control's Priority Cards were migrated onto this exact
 * component rather than maintaining a second, diverged layout
 * (`ShipRecordCard`/`PriorityCard`, both retired — see their own
 * deprecation notes). Every current and future ship-grid surface — Fleet
 * Dashboard, Mission Control, and any future Fleet Roadmap/Squadron view —
 * renders this one component; no page maintains its own card layout.
 * Quartermaster Edition visual enhancements are deliberately deferred to a
 * future Beta sprint (EWO-032 Commander Intent) — this is presentation
 * standardization only, not a redesign.
 *
 * EWO-033 (Task 4/9) — the canonical Beta layout contract: four
 * structural regions, each with a reserved minimum height regardless of
 * which `buildState` branch is active, so cards never collapse to
 * different heights within the same grid based on content alone (Ruling
 * 8). Priority is deliberately NOT rendered here — it's page-level
 * wrapper context (`PriorityLabel`, Ruling 2/3).
 */
export default function ShipCard({
  ship,
  buildName,
  progress,
  buildState,
  stockRoleFocus,
}: {
  ship: Ship
  buildName: string
  progress: BuildProgressResult
  buildState: FleetBuildState
  /** EWO-033 (Task 6/7) — resolved once per caller via the shared
   * `resolveShipStockRoleFocus()` (never derived from `ship.role`, which
   * mirrors the active Build's own role text, not stock ship metadata —
   * see that resolver's doc comment). Undefined renders manufacturer alone. */
  stockRoleFocus: string | undefined
}) {
  const [mode, setMode] = useState<ShipImagePresentationMode>('cover')
  // UX-005A (Deliverable 8) — ShipCard is the one canonical card both
  // Mission Control and Fleet Dashboard render, so resolving the custom-
  // image tier here covers both surfaces at once.
  const { src: resolvedSrc } = useResolvedShipImage(ship.id, ship.imageUrl)

  return (
    // SW-013B (Objective 1) — Ship Workspace Promotion. The canonical
    // click-anywhere-to-navigate target for every ship-grid surface
    // (Fleet Dashboard, Mission Control) is now Ship Workspace, not Ship
    // Detail — Ship Detail remains fully reachable (its own Select Ship
    // dropdown, and a new "View in Ship Detail" link inside Ship
    // Workspace itself — Objective 2's "Preserve Legacy Access") but is
    // no longer the default destination a Commander lands on by clicking
    // a ship.
    <Link
      to={`/ship-workspace/${ship.id}`}
      className="panel p-4 flex flex-col gap-3 h-full hover:shadow-glow hover:border-cyan/30 transition-all group"
    >
      {/* Region 1 — Image: fixed shared aspect ratio, full card width,
          consistent height regardless of a real photo vs the branded
          fallback (ShipImage handles that internally). EWO-033A (Task 4/6)
          — both a real photo and the fallback now fill this frame via a
          centered object-cover crop; only the hover-zoom is real-photo-only. */}
      <ShipImage
        src={resolvedSrc}
        alt={ship.name}
        className="aspect-video rounded-lg bg-black/40 border border-white/5 overflow-hidden relative"
        imageClassName={mode === 'contain' ? 'block w-full h-full object-cover animate-ship-image-fade-in' : 'block w-full h-full object-cover group-hover:scale-105 transition-transform duration-300'}
        presentation="auto"
        onPresentationChange={setMode}
      />

      {/* Region 2 — Identity: name, ownership badge, manufacturer + stock
          role/focus. Reserved minimum height covers two lines (name +
          identity line) even when the identity line is manufacturer-only,
          so a ship with no resolved stock role never renders a shorter
          card than one with a two-part identity line. */}
      <div className="flex items-start justify-between gap-2 min-h-11">
        <div className="min-w-0">
          <h3 className="font-display font-semibold text-white leading-tight truncate">{ship.name}</h3>
          <p className="text-xs text-muted mt-0.5 line-clamp-1">{formatShipIdentityLine(ship.manufacturer, stockRoleFocus)}</p>
        </div>
        <Badge tone={ownershipTone(ship.ownership)}>{ship.ownership}</Badge>
      </div>

      {/* Region 3 — Active Loadout: always rendered (even for an Invalid
          Loadout, where the Build reference itself is still real and
          nameable), one reserved-height line, regardless of buildState. */}
      <div className="text-xs text-muted min-h-5">
        Active Loadout: <span className="text-cyan/90 font-medium">{buildState === 'FACTORY_ONLY' ? 'Factory Loadout' : buildName}</span>
      </div>

      {/* Region 4 — Readiness/status: reserved height sized for the
          tallest real variant (progress bar + missing-item line) so the
          three shorter variants (Invalid/Factory/Mission Ready, each one
          line) never collapse the card — `flex-1` also lets this region
          absorb any extra stretched grid-row height evenly. */}
      <div className="flex-1 flex flex-col justify-start gap-1.5 min-h-11">
        {buildState === 'INVALID_BUILD' ? (
          <div className="flex items-center gap-1.5 text-danger text-xs font-semibold uppercase tracking-widest">
            <AlertOctagon size={14} /> Invalid Loadout
          </div>
        ) : buildState === 'FACTORY_ONLY' ? (
          <div className="flex items-center gap-1.5 text-xs text-cyan/80">
            <Settings2 size={13} /> No custom Loadout assigned yet
          </div>
        ) : buildState === 'MISSION_READY' ? (
          <div className="flex items-center gap-1.5 text-success text-xs font-semibold uppercase tracking-widest">
            <CheckCircle2 size={14} /> Mission Ready
          </div>
        ) : (
          <>
            <ReadinessBar value={progress.percentage} size="sm" />
            <div className="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span className="line-clamp-1">
                Missing: {[...progress.missingAssignments, ...progress.upgradeOpportunities, ...progress.invalidTargets].join(', ')}
              </span>
            </div>
          </>
        )}
      </div>
    </Link>
  )
}
