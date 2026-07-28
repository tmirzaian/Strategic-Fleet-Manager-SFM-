import { NavLink } from 'react-router-dom'
import { resolveBrandingSrc } from '../config/assets'
import {
  Radar,
  LayoutGrid,
  Package,
  ScanSearch,
  Map,
  BookText,
  Satellite,
  Wrench,
} from 'lucide-react'

// The sidebar tells the story of the player's workflow (Alpha 2.4, Part 1)
// — Build Manager is retired as a standalone nav destination (its
// Quartermaster Template / assigned-loadout functionality lives in
// Loadout Manager now), and Mission Composer is renamed to the term
// players actually think in: Loadout Manager.
//
// SW-013B (Ship Workspace Promotion, Objectives 1/5) — Ship Workspace is
// now the primary ship-management entry point, in the position Ship
// Detail previously held (right after Fleet Dashboard), relabeled from
// "Ship Workspace (Prototype)" to "Ship Workspace" now that the
// underlying page has cleared feature parity, certification, and
// Commander acceptance (SW-011A/SW-012B/SW-013A/CAT-HOLD-001/002) — the
// "Prototype" framing was no longer accurate. Ship Detail moves later in
// the list, reflecting its new role as a supporting/comparison tool
// (Objective 2) rather than the default destination — it is not removed,
// hidden, or demoted in capability, only in position.
//
// EWO-060 — the label is renamed again, "Ship Workspace" to "Ship
// Management" (a terminology correction, not a second promotion — the
// route, position, and everything SW-013B established above is
// unchanged). "Ship Workspace" is retired from every Commander-facing
// surface; the internal `/ship-workspace` route name is intentionally
// left alone (Internal Naming Policy — renaming it would be churn
// without Commander benefit).
//
// EWO-062A (Part B) — Navigation Retirement. Loadout Manager, Quick
// Update, and Ship Detail are removed from this list — their workflows
// are now absorbed by Ship Management (Manage Loadout / Change Installed
// Components, and the ship-context readiness view respectively) and
// keeping all three as separate primary nav destinations left the
// Sidebar advertising three retired paths alongside the one the
// Commander is actually meant to use. This is navigation retirement, not
// route destruction: `/loadout-manager`, `/quick-update`, and `/ship`
// (and their page components) are untouched and still reachable by
// direct URL/deep link/regression test — only their entries in this
// array (and therefore their Sidebar presence) are gone. `navItems` is a
// plain array rendered by one `.map()` with no separator elements
// between entries, so removing entries closes any gap automatically —
// no dedicated "remove the gap" step was needed.
const navItems = [
  { to: '/', label: 'Mission Control', icon: Radar, end: true },
  { to: '/fleet', label: 'Fleet Dashboard', icon: LayoutGrid },
  // FTB-001A (Workstream D) — previously hardcoded to '/ship/ghost',
  // which silently opened a specific seed ship (whether or not it existed
  // in the Commander's real fleet) any time this generic nav link was
  // clicked. General navigation now lands on a blank ship selection
  // instead of an inferred/hardcoded ship. Unchanged by SW-013B — this
  // reasoning applies equally to the blank `/ship-workspace` entry below.
  { to: '/ship-workspace', label: 'Ship Management', icon: Wrench },
  { to: '/hangar', label: 'Hangar Inventory', icon: Package },
  { to: '/decision-center', label: 'Decision Center', icon: ScanSearch },
  { to: '/roadmap', label: 'Fleet Roadmap', icon: Map },
  { to: '/log', label: "Captain's Log", icon: BookText },
]

export default function Sidebar() {
  // EWO-015: the Sidebar's entire brand lockup — commissioning mark, SFM
  // wordmark, "Strategic Fleet Manager" title, and motto — is one
  // Design-Authority-owned commissioned image, resolved through its own
  // semantic key. It deliberately does not include the application
  // version or any panel/background — never a hard-coded asset path here.
  // UX-004A (Deliverable 4) — the version is no longer rendered anywhere
  // in the Sidebar at all; AppFooter (src/components/layout/AppFooter.tsx)
  // is now the sole live-text version display in the application.
  const brandLockupSrc = resolveBrandingSrc('sidebarBrandLockup')

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col border-r border-white/5 bg-panel/60 backdrop-blur-sm">
      {/* Brand lockup — EWO-015, density-tuned EWO-015B, further tightened
          UX-004A (Deliverable 5): reads as a floating operational console
          mounted in the compartment, matching the nav console's
          bordered-panel treatment below. The commissioned image is the
          sole identity content; no second panel is nested inside this
          console around the image itself. Internal padding is
          intentionally tight (px-2.5/py-2, down from px-2.5/py-3.5) now
          that the live version label beneath the image is gone
          (Deliverable 4 — it moved to AppFooter, the sole remaining
          version display) — the cell is fitted to the branding itself
          rather than the branding floating inside a larger container,
          while still leaving real clearance around the image (never
          touching the console's own border). Hardpoint sizing, image
          asset, and aspect ratio are all untouched — only the console's
          own vertical padding changed. */}
      <div className="mx-3 mt-3 mb-1 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2 flex flex-col items-center text-center">
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
