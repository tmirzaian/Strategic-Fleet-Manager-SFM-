import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface ActionCardProps {
  /** Canonical glyph — one icon per concept, never reused for another
   * meaning within the same surface (see the Hero's own Glyph Standard,
   * UX-001A Deliverable 7). */
  icon: any
  /** Action title — the Commander decision this card represents. */
  title: string
  /** Quantity / affected count — the scale of this action. UX-001A.4
   * promoted this to the card's primary information hierarchy; UX-001A.4A
   * kept that promotion but stepped the scale down one notch (`text-xl`,
   * not `CriticalMetricTile`'s `text-2xl`) so the card stays compact — the
   * first textual element the eye recognizes, not a secondary far-right
   * figure, but not a Fleet Status tile either. */
  count: number | string
  /** Severity color — communicates state (ready now / opportunity /
   * problem); the glyph communicates meaning. Renders as the card's own
   * left accent stripe, the icon housing tint, and the count's color —
   * three independent places to catch the same signal at a glance. */
  accent: string
  /** Supporting context — e.g. affected ship names with their own deep
   * links. Optional: a future consumer may have no natural context list. */
  children?: ReactNode
  /** Optional whole-card click target. Omit to keep independent links
   * inside `children` as the only interactive targets (Mission Control's
   * own Priority Actions usage — one action can name several ships, each
   * with its own destination, so no single whole-card link would be
   * correct there). Mutually exclusive with `onClick` — a card navigates
   * to a destination or performs an in-page action, never both. */
  to?: string
  /** UX-001B — an alternative to `to` for actions that filter/toggle
   * state on the current page rather than navigate away (Quartermaster
   * Logistics' own demand-category cards: click filters the Work Queue
   * below to that category, no route change). Renders as a real `<button>`
   * for native keyboard operability rather than a `to`-less `div` with a
   * synthetic click handler. */
  onClick?: () => void
  /** Whether this card's own `onClick` filter is currently engaged —
   * purely a visual toggle state (brighter ring), no effect when `onClick`
   * is omitted. */
  active?: boolean
}

/**
 * UX-001A.2 — Action Card: the canonical presentation for an operational
 * action ("Design System Amendment": operational concepts are
 * encapsulated — bounded visual units whenever they represent independent
 * Commander decisions, the same standard `CriticalMetricTile`/
 * `FleetStatusTile` already established for operational metrics).
 *
 * UX-001A.4 shared `CriticalMetricTile`'s typographic hierarchy — count
 * first, label beneath it, ship context beneath that ("Number → Action →
 * Ship Context", mirroring Fleet Status's own "Number → State → Ship
 * Context") — but copied its dimensions too literally (`text-2xl` count,
 * `w-10 h-10` icon housing, `p-4`), which stretched each card past what
 * three lines of content need.
 *
 * UX-001A.4A correction: same hierarchy, same typography *family*, one
 * size step down — a compact action queue card, not a Fleet Status tile
 * wearing a different color. Fleet Status is a classification panel;
 * this is a work queue. They share grammar, not geometry:
 *   - count: `text-xl font-display font-bold leading-none` (was
 *     `text-2xl`) — still display font, still bold, still accent-colored,
 *     still the first thing the eye lands on; one controlled step below
 *     Fleet Status's own scale rather than identical to it.
 *   - icon housing: `w-8 h-8` (was `w-10 h-10`) — accent-tinted, unlike
 *     Fleet Status's uniform cyan treatment (the one deliberate color
 *     divergence between the two panels, unchanged since UX-001A.4).
 *   - card padding: `p-3` (was `p-4`) — compact, not stretched.
 * Label (`text-[11px] uppercase tracking-widest text-muted`) and ship
 * context (`text-[11px] text-muted/80`) keep the exact Fleet Status
 * treatment from UX-001A.4 — those didn't cause the fitment problem, only
 * the count scale and the icon/padding geometry did.
 *
 * One card = one action = one decision, perceivable before reading any
 * text: a colored left stripe + icon housing + count all carry the same
 * severity signal, so relative importance scans instantly even at a
 * glance.
 *
 * First consumer: Mission Control's Priority Actions panel. Intended for
 * reuse anywhere else in Strategic Fleet Manager an operational action
 * needs the same treatment (Decision Center, Fleet Dashboard, Org
 * Management, Manufacturing, Insurance, future Quartermaster modules) —
 * kept presentation-only and domain-agnostic (no ship/fleet concept baked
 * in) so it travels cleanly.
 *
 * UX-001B — second consumer, Quartermaster Logistics' own demand-category
 * cards. These filter the Procurement Work Queue in place rather than
 * navigating anywhere, so this mission added `onClick`/`active` as a third
 * interaction mode alongside the existing `to` (Link) and bare (no
 * interaction) modes — mutually exclusive with `to`, rendered as a real
 * `<button>` so it stays keyboard-operable like every other Action Card.
 */
export default function ActionCard({ icon: Icon, title, count, accent, children, to, onClick, active }: ActionCardProps) {
  const body = (
    <>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}1f` }}>
        <Icon size={16} style={{ color: accent }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xl font-display font-bold leading-none" style={{ color: accent }}>
          {count}
        </div>
        <div className="text-[11px] uppercase tracking-widest text-muted mt-1 truncate">{title}</div>
        {children && <div className="text-[11px] text-muted/80 mt-1 truncate">{children}</div>}
      </div>
    </>
  )

  const className = 'panel border-l-[3px] p-3 flex items-start gap-2.5 min-w-0 transition-colors'

  if (to) {
    return (
      <Link
        to={to}
        className={`${className} hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg`}
        style={{ borderLeftColor: accent }}
      >
        {body}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active ?? false}
        className={`${className} text-left hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${active ? 'ring-1 ring-inset' : ''}`}
        style={{ borderLeftColor: accent, ...(active ? { boxShadow: `inset 0 0 0 1px ${accent}` } : undefined) }}
      >
        {body}
      </button>
    )
  }

  return (
    <div className={`${className} hover:bg-white/[0.02]`} style={{ borderLeftColor: accent }}>
      {body}
    </div>
  )
}
