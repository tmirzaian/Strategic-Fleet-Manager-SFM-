import type { LucideIcon } from 'lucide-react'
import type { Tone } from '../Badge'

export type MountedInstrumentTrend = 'up' | 'down' | 'flat'

export interface MountedInstrumentProps {
  title: string
  value: string | number
  icon?: LucideIcon
  /** Reuses the app's one existing color vocabulary (`src/components/Badge.tsx`'s
   * `Tone`) — never a new palette. Omitted by default (the box border
   * stays neutral `white/10` and the frame hairline stays cyan — the
   * instrument's original, certified resting appearance). Only pass this
   * when the value itself needs to read as more than neutral
   * information; the caller decides what the status means, this
   * component only renders the accent. */
  status?: Tone
  trend?: MountedInstrumentTrend
  testId?: string
}

const TREND_GLYPH: Record<MountedInstrumentTrend, string> = { up: '▲', down: '▼', flat: '▬' }
/** The frame hairline's own color per status — independent of the box's
 * own border (which only changes for a non-neutral status; see
 * `borderClassFor` below). */
const HAIRLINE_VIA: Record<Tone, string> = {
  cyan: 'via-cyan/50',
  success: 'via-success/50',
  warning: 'via-warning/50',
  danger: 'via-danger/50',
  muted: 'via-white/20',
  invalid: 'via-danger/60',
  gold: 'via-gold/50',
}
function borderClassFor(status: Tone | undefined): string {
  if (!status || status === 'cyan') return 'border-white/10'
  const map: Record<Tone, string> = {
    cyan: 'border-white/10',
    success: 'border-success/25',
    warning: 'border-warning/25',
    danger: 'border-danger/25',
    muted: 'border-white/10',
    invalid: 'border-danger/40',
    gold: 'border-gold/25',
  }
  return map[status]
}

/**
 * EWO-110 (Part A) — the canonical Quartermaster Mounted Instrument,
 * superseding EWO-109's own narrower `stationShell` version (which took
 * only `label`/`value`). Recessed housing, structural corner cuts, a
 * cyan (or `status`-toned) frame, Quartermaster Gold numeric value, glass
 * panel, and a restrained environmental-reflection sheen — per ADR-004 §5
 * ("Mounted Information... recessed panels, structural frames... belongs
 * to the room") and §6 (color authority; `status` only ever draws from
 * the existing `Tone` vocabulary, never a new color).
 *
 * Pure presentation — `icon`/`value`/`title`/`status`/`trend` are all
 * caller-supplied; this component computes nothing and holds no business
 * meaning for any of them.
 */
export default function MountedInstrument({ title, value, icon: Icon, status, trend, testId }: MountedInstrumentProps) {
  const borderClass = borderClassFor(status)
  const viaClass = HAIRLINE_VIA[status ?? 'cyan']
  return (
    <div
      data-testid={testId}
      className={`relative bg-black/30 backdrop-blur-md border ${borderClass} rounded-md px-3 py-3 text-center overflow-hidden`}
    >
      {/* Structural corner cuts. */}
      <span className="pointer-events-none absolute top-0.5 left-0.5 w-1.5 h-1.5 border-t border-l border-cyan/25" aria-hidden="true" />
      <span className="pointer-events-none absolute bottom-0.5 right-0.5 w-1.5 h-1.5 border-b border-r border-cyan/25" aria-hidden="true" />
      {/* Cyan (or status-toned) frame hairline. */}
      <span className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${viaClass} to-transparent`} aria-hidden="true" />
      {/* Subtle environmental reflection — pure atmosphere, never information. */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent" aria-hidden="true" />

      <div className="relative z-10">
        {Icon && <Icon size={16} className="mx-auto mb-1 text-cyan/70" aria-hidden="true" />}
        <p className="text-2xl font-display font-bold text-gold leading-none">
          {value}
          {trend && (
            <span className="ml-1.5 text-xs align-middle text-muted" aria-label={`trend ${trend}`}>
              {TREND_GLYPH[trend]}
            </span>
          )}
        </p>
        <p className="text-[10px] uppercase tracking-widest text-muted mt-1.5">{title}</p>
      </div>
    </div>
  )
}
