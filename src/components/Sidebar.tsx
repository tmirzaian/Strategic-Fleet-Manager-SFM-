import { NavLink } from 'react-router-dom'
import { APP_VERSION_LABEL } from '../config/appVersion'
import { resolveBrandingSrc } from '../config/assets'
import {
  Radar,
  LayoutGrid,
  Rocket,
  Package,
  Zap,
  ScanSearch,
  Map,
  BookText,
  Sparkles,
  Satellite,
} from 'lucide-react'

// The sidebar tells the story of the player's workflow (Alpha 2.4, Part 1)
// — Build Manager is retired as a standalone nav destination (its
// Quartermaster Template / assigned-loadout functionality lives in
// Loadout Manager now), and Mission Composer is renamed to the term
// players actually think in: Loadout Manager.
const navItems = [
  { to: '/', label: 'Mission Control', icon: Radar, end: true },
  { to: '/fleet', label: 'Fleet Dashboard', icon: LayoutGrid },
  { to: '/ship/ghost', label: 'Ship Detail', icon: Rocket },
  { to: '/loadout-manager', label: 'Loadout Manager', icon: Sparkles },
  { to: '/hangar', label: 'Hangar Inventory', icon: Package },
  { to: '/quick-update', label: 'Quick Update', icon: Zap },
  { to: '/decision-center', label: 'Decision Center', icon: ScanSearch },
  { to: '/roadmap', label: 'Fleet Roadmap', icon: Map },
  { to: '/log', label: "Captain's Log", icon: BookText },
]

export default function Sidebar() {
  // EWO-014A: the enlarged (~72px) brand-lockup mark resolves through its
  // own semantic key at a matching source resolution — never the compact
  // 64px derivative upscaled, and never a hard-coded asset path here.
  const logoSrc = resolveBrandingSrc('sidebarCommissioningMark')

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col border-r border-white/5 bg-panel/60 backdrop-blur-sm">
      {/* Brand lockup — EWO-014: reads as a floating operational console mounted
          in the compartment, matching the nav console's bordered-panel treatment
          below, not a divider strip blended into the sidebar's own background.
          SFM is the primary visual anchor; the mark is enlarged ~29%; the
          descriptive lockup and release version are visually subordinate. */}
      <div className="mx-3 mt-3 mb-1 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-6 flex flex-col items-center text-center">
        {logoSrc ? (
          <img src={logoSrc} alt="Strategic Fleet Manager" className="w-[72px] h-[72px] object-contain shrink-0" />
        ) : (
          <Satellite className="text-cyan" size={62} />
        )}
        <div className="mt-3 font-display font-bold text-3xl tracking-[0.08em] leading-none text-white">SFM</div>
        <div className="font-display font-medium text-[9px] uppercase tracking-[0.2em] text-muted/70 mt-1.5 leading-snug">
          Strategic Fleet Manager
        </div>
        <div className="text-[8px] uppercase tracking-[0.15em] text-muted/40 mt-2">{APP_VERSION_LABEL}</div>
        {/* Slogan color treatment (EWO-014): Plan → Cyan, Outfit → Gold,
            Prepare → Orange, Succeed → Green. "Gold" newly defines the
            previously-reserved-but-undefined Advisory Gold token
            (tailwind.config.js) for this one narrowly-scoped word only.
            "Orange" reuses the existing Operational Amber (`warning`) token
            rather than introducing a near-duplicate hue for a single word. */}
        <div className="text-[9px] uppercase tracking-[0.15em] mt-3 leading-relaxed">
          <span className="text-cyan/70">Plan</span> <span className="text-muted/30">•</span>{' '}
          <span className="text-gold/80">Outfit</span>
          <br />
          <span className="text-warning/80">Prepare</span> <span className="text-muted/30">•</span>{' '}
          <span className="text-success/80">Succeed</span>
        </div>
      </div>
      {/* Navigation reads as a floating operational panel — a restrained bordered
          surface set inside the rail, not a generic full-height web menu. */}
      <nav className="flex-1 overflow-y-auto py-5 px-3">
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-1.5 space-y-1">
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
        </div>
      </nav>
    </aside>
  )
}
