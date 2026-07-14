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
  // EWO-015: the Sidebar's entire brand lockup — commissioning mark, SFM
  // wordmark, "Strategic Fleet Manager" title, and motto — is one
  // Design-Authority-owned commissioned image, resolved through its own
  // semantic key. It deliberately does not include the application
  // version (see APP_VERSION_LABEL below) or any panel/background —
  // never a hard-coded asset path here.
  const brandLockupSrc = resolveBrandingSrc('sidebarBrandLockup')

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col border-r border-white/5 bg-panel/60 backdrop-blur-sm">
      {/* Brand lockup — EWO-015, density-tuned EWO-015B: reads as a floating
          operational console mounted in the compartment, matching the nav
          console's bordered-panel treatment below. The commissioned image is
          the sole identity content; no second panel is nested inside this
          console around the image itself. Internal padding is intentionally
          tight (px-2.5/py-3.5, down from px-4/py-6) so the artwork reads as
          the dominant element while still never touching the console's own
          border. */}
      <div className="mx-3 mt-3 mb-1 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-3.5 flex flex-col items-center text-center">
        {brandLockupSrc ? (
          // EWO-015C — optical-fit correction. The console/hardpoint CSS was
          // already verified to match the EWO-015B spec exactly (no residual
          // wrapper spacing bug); the perceived lack of visual dominance is
          // baked into the approved master itself, which carries generous
          // transparent margins around its content (measured: content fills
          // only ~75% of the canvas in each dimension, asymmetric — the top
          // margin is meaningfully smaller than the bottom margin). No new
          // asset, no source-file edit: overflow-hidden + a calibrated
          // uniform `scale` and `transform-origin` on the <img> optically
          // crops those margins at render time only, fully reversible, with
          // object-fit/object-position and the hardpoint's own box
          // untouched. Values were derived from the master's measured
          // content bounding box plus a safety margin so no real content is
          // ever clipped.
          <div className="w-[180px] h-[270px] shrink-0 overflow-hidden pointer-events-none select-none">
            <img
              src={brandLockupSrc}
              alt="Strategic Fleet Manager"
              className="w-full h-full object-contain object-center scale-125 origin-[50%_40%]"
            />
          </div>
        ) : (
          <Satellite className="text-cyan" size={62} />
        )}
        {/* Live application version — never baked into the brand-lockup
            artwork, so a future release only requires updating this text,
            not regenerating or replacing the image. Tightened to mt-2
            (EWO-015B) so it reads as belonging to the lockup above it. */}
        <div className="text-[8px] uppercase tracking-[0.15em] text-muted/40 mt-2">{APP_VERSION_LABEL}</div>
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
