import { NavLink } from 'react-router-dom'
import {
  Radar,
  LayoutGrid,
  Rocket,
  Wrench,
  Package,
  Zap,
  ScanSearch,
  Map,
  BookText,
  Satellite,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'Mission Control', icon: Radar, end: true },
  { to: '/fleet', label: 'Fleet Dashboard', icon: LayoutGrid },
  { to: '/ship/ghost', label: 'Ship Detail', icon: Rocket },
  { to: '/builds', label: 'Build Manager', icon: Wrench },
  { to: '/hangar', label: 'Hangar Inventory', icon: Package },
  { to: '/quick-update', label: 'Quick Update', icon: Zap },
  { to: '/decision-center', label: 'Decision Center', icon: ScanSearch },
  { to: '/roadmap', label: 'Fleet Roadmap', icon: Map },
  { to: '/log', label: "Captain's Log", icon: BookText },
]

export default function Sidebar() {
  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col border-r border-white/5 bg-panel/60 backdrop-blur-sm">
      <div className="px-5 py-6 flex items-center gap-2 border-b border-white/5">
        <Satellite className="text-cyan" size={22} />
        <div>
          <div className="font-display font-bold text-lg tracking-wide leading-none text-white">
            STRATEGIC<span className="text-cyan"> FLEET</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted mt-1">Manager · Sprint 1</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-cyan/10 text-cyan shadow-[inset_0_0_0_1px_rgba(53,208,255,0.35)]'
                  : 'text-muted hover:text-white hover:bg-white/5'
              }`
            }
          >
            <Icon size={17} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-white/5 text-[10px] text-muted uppercase tracking-widest">
        Update Budget · 2 min
      </div>
    </aside>
  )
}
