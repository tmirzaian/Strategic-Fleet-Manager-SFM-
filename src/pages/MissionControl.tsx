import { Link } from 'react-router-dom'
import { Gauge, ShipWheel, ScanSearch, Timer, LayoutGrid, ClipboardList } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import PriorityCard from '../components/PriorityCard'
import { buildProcurementList } from '../utils/procurement'

function StatTile({ icon: Icon, label, value, accent, sub }: { icon: any; label: string; value: string | number; accent?: string; sub?: string }) {
  return (
    <div className="panel p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-cyan/10 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-cyan" />
      </div>
      <div>
        <div className="text-2xl font-display font-bold leading-none" style={accent ? { color: accent } : undefined}>
          {value}
        </div>
        <div className="text-[11px] uppercase tracking-widest text-muted mt-1">{label}</div>
        {sub && <div className="text-[11px] text-muted/80 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export default function MissionControl() {
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const hardpoints = useFleetStore((s) => s.hardpoints)

  const overallReadiness = Math.round(ships.reduce((sum, s) => sum + s.readiness, 0) / ships.length)
  const owned = ships.filter((s) => s.ownership === 'Owned').length
  const purchased = ships.filter((s) => s.ownership === 'Purchased').length
  const loaner = ships.filter((s) => s.ownership === 'Loaner').length
  const neededItems = ships.reduce((sum, s) => sum + s.missing.length, 0)
  const topPriority = [...ships].sort((a, b) => a.priority - b.priority).slice(0, 3)
  const procurement = buildProcurementList(hardpoints, builds, ships)

  const buildName = (id: string) => builds.find((b) => b.id === id)?.name ?? 'Unknown Build'

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Mission Control</p>
        <h1 className="text-2xl font-display font-bold text-white">What should I work on?</h1>
        <p className="text-sm text-muted mt-1">A single glance at fleet status, before you spend your two minutes.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={Gauge} label="Overall Fleet Readiness" value={`${overallReadiness}%`} accent="#35D0FF" />
        <StatTile
          icon={ShipWheel}
          label="Ships Active"
          value={ships.length}
          sub={`Owned ${owned} · Purchased ${purchased} · Loaner ${loaner}`}
        />
        <StatTile icon={ScanSearch} label="Needed Items" value={neededItems} accent="#FFD166" />
        <StatTile icon={Timer} label="Update Budget" value="2 min" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-lg text-white">Top Priority Ships</h2>
          <Link to="/fleet" className="text-sm text-cyan hover:underline flex items-center gap-1">
            <LayoutGrid size={14} /> View full fleet
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {topPriority.map((ship, i) => (
            <PriorityCard key={ship.id} ship={ship} buildName={buildName(ship.activeBuildId)} rank={i + 1} />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList size={18} className="text-cyan" />
          <h2 className="font-display font-semibold text-lg text-white">Procurement List</h2>
        </div>
        <p className="text-xs text-muted mb-3">
          What to go get, fleet-wide — grouped by component so you don't chase the same part twice.
        </p>
        {procurement.length === 0 ? (
          <div className="panel p-5 text-sm text-success">Every active Build target is satisfied. Nothing to procure.</div>
        ) : (
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                    <th className="px-5 py-3 font-medium">Component</th>
                    <th className="px-5 py-3 font-medium">Type / Size</th>
                    <th className="px-5 py-3 font-medium">Qty Needed</th>
                    <th className="px-5 py-3 font-medium">Ships / Builds Needing It</th>
                  </tr>
                </thead>
                <tbody>
                  {procurement.map((line) => (
                    <tr key={line.itemName} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-5 py-3 text-white font-medium whitespace-nowrap">{line.itemName}</td>
                      <td className="px-5 py-3 text-muted whitespace-nowrap">{line.type} · {line.size}</td>
                      <td className="px-5 py-3 font-mono text-cyan">{line.qtyNeeded}</td>
                      <td className="px-5 py-3 text-muted text-xs">{line.neededBy.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Link to="/decision-center" className="panel p-5 flex items-center justify-between hover:border-cyan/30 hover:shadow-glow transition-all">
          <div>
            <h3 className="font-display font-semibold text-white">Found loot? Check it.</h3>
            <p className="text-xs text-muted mt-1">Run it through the Decision Center to see if you should keep it.</p>
          </div>
          <ScanSearch className="text-cyan" size={22} />
        </Link>
        <Link to="/quick-update" className="panel p-5 flex items-center justify-between hover:border-cyan/30 hover:shadow-glow transition-all">
          <div>
            <h3 className="font-display font-semibold text-white">Something changed?</h3>
            <p className="text-xs text-muted mt-1">Log it in under two minutes with Quick Update.</p>
          </div>
          <Timer className="text-cyan" size={22} />
        </Link>
      </div>
    </div>
  )
}
