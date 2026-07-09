import { useParams, Link, useNavigate } from 'react-router-dom'
import { MapPin, Clock, Zap, ListChecks, ChevronDown, Rocket, ShipWheel } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import ReadinessBar from '../components/ReadinessBar'
import Badge, { statusTone, ownershipTone } from '../components/Badge'

export default function ShipDetail() {
  const { shipId } = useParams()
  const navigate = useNavigate()
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const hardpoints = useFleetStore((s) => s.hardpoints)
  const setActiveBuild = useFleetStore((s) => s.setActiveBuild)

  const ship = ships.find((s) => s.id === shipId) ?? ships[0]
  const shipBuilds = builds.filter((b) => b.shipId === ship.id)
  const activeBuild = builds.find((b) => b.id === ship.activeBuildId) ?? shipBuilds[0]
  const shipHardpoints = hardpoints
    .filter((h) => h.buildId === activeBuild?.id)
    .sort((a, b) => a.slotLabel.localeCompare(b.slotLabel))
  // Keep the canonical slot order rather than alphabetical.
  const slotOrder = ['Weapon 1', 'Weapon 2', 'Power 1', 'Power 2', 'Shield 1', 'Shield 2', 'Cooler 1', 'Cooler 2', 'Quantum Drive', 'Radar', 'Life Support']
  shipHardpoints.sort((a, b) => slotOrder.indexOf(a.slotLabel) - slotOrder.indexOf(b.slotLabel))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Ship Detail</p>
          <h1 className="text-2xl font-display font-bold text-white">Is this ship ready?</h1>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-widest text-muted flex items-center gap-1.5 mb-1.5">
            <ShipWheel size={13} /> Select Ship
          </label>
          <select
            value={ship.id}
            onChange={(e) => navigate(`/ship/${e.target.value}`)}
            className="bg-panel border border-cyan/30 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50 min-w-[220px]"
          >
            {ships.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="h-36 sm:h-44 bg-black/40 border-b border-white/5 flex items-center justify-center relative">
          <div
            className="absolute inset-0 opacity-40"
            style={{ background: 'radial-gradient(circle at 30% 20%, rgba(53,208,255,0.15), transparent 60%)' }}
          />
          <Rocket className="text-muted/30 relative" size={56} strokeWidth={1.2} />
          <div className="absolute bottom-3 left-4">
            <Badge tone={ownershipTone(ship.ownership)}>{ship.ownership}</Badge>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-display font-bold text-white">{ship.name}</h2>
              <p className="text-sm text-muted mt-1">{ship.manufacturer} · {ship.role}</p>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted">
                <span className="flex items-center gap-1.5"><MapPin size={13} /> {ship.location}</span>
                <span className="flex items-center gap-1.5"><Clock size={13} /> Updated {ship.lastUpdated}</span>
              </div>
            </div>
            <div className="w-full sm:w-64">
              <ReadinessBar value={ship.readiness} />
            </div>
          </div>

          <div className="scanline-divider" />

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs uppercase tracking-widest text-muted">Active Build</label>
            <div className="relative">
              <select
                value={activeBuild?.id}
                onChange={(e) => setActiveBuild(ship.id, e.target.value)}
                className="appearance-none bg-black/30 border border-cyan/30 text-cyan rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium focus:outline-none"
              >
                {shipBuilds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-cyan pointer-events-none" />
            </div>
            {shipBuilds.length > 1 && (
              <span className="text-[11px] text-muted">{shipBuilds.length} builds available for this ship</span>
            )}
          </div>

          {ship.missing.length > 0 ? (
            <div className="bg-warning/5 border border-warning/25 rounded-lg px-4 py-3">
              <p className="text-xs uppercase tracking-widest text-warning mb-1">Needed for {activeBuild?.name}</p>
              <p className="text-sm text-white">{ship.missing.join(', ')}</p>
            </div>
          ) : (
            <div className="bg-success/5 border border-success/25 rounded-lg px-4 py-3">
              <p className="text-sm text-success">Target Build fully installed. Ship is mission ready.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              to="/quick-update"
              className="inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
            >
              <Zap size={15} /> Quick Update
            </Link>
            <Link
              to="/hangar"
              className="inline-flex items-center gap-2 border border-white/15 text-white font-medium text-sm px-4 py-2 rounded-lg hover:border-white/35 transition-colors"
            >
              <ListChecks size={15} /> Change Disposition
            </Link>
          </div>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-display font-semibold text-white">Hardpoints — {activeBuild?.name}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                <th className="px-5 py-3 font-medium">Slot</th>
                <th className="px-5 py-3 font-medium">Installed</th>
                <th className="px-5 py-3 font-medium">Target Build</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shipHardpoints.map((hp) => (
                <tr key={hp.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3 text-white font-medium">{hp.slotLabel}</td>
                  <td className="px-5 py-3 text-muted">{hp.installedItem}</td>
                  <td className="px-5 py-3 text-cyan/90">{hp.targetItem}</td>
                  <td className="px-5 py-3">
                    <Badge tone={statusTone(hp.status)}>{hp.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
