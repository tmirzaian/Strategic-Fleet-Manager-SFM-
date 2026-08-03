import type { ReactNode } from 'react'
import PageEnvironment from '../layout/PageEnvironment'
import type { EnvironmentId } from '../../config/assets/types'

export interface StationEnvironmentMountProps {
  environmentId: EnvironmentId
  children?: ReactNode
  /**
   * Tailwind min-height class, e.g. `'lg:min-h-[560px]'`. Deliberately a
   * Station-supplied value, not a shell-wide constant — how much of a
   * given piece of environment art is worth revealing depends on that
   * art's own composition (QDS-004 Part F.1: the shell owns the
   * extend-and-fade *mechanism*, never a universal number). Defaults to
   * Flight Commander's own certified EWO-108 value so this component is a
   * drop-in replacement, not a behavior change, for its first consumer.
   */
  minHeightClassName?: string
  /** Tailwind height class for the bottom fade band, e.g. `'h-28 lg:h-40'`. Same Station-supplied reasoning as `minHeightClassName`. */
  fadeHeightClassName?: string
  bordered?: boolean
  /**
   * EWO-114 — a second populated rail, rendered after the mount's own
   * auto-filling open-window spacer (which continues to render
   * unconditionally between `children` and this prop). `children` alone
   * remains Flight Commander's exact original shape (one rail, then open
   * space) — `secondaryRail` is additive and optional, so every existing
   * consumer is byte-identical when it's omitted. Added because Mission
   * Control's Bridge is a genuinely different, no-less-legitimate shape
   * (two rails flanking an open observation window) that the mount's
   * original single-rail-then-fill design couldn't host without either
   * this small extension or a parallel, hand-rolled reimplementation —
   * the latter being exactly what QDS-006 Part H's "compose, never
   * reimplement" rule exists to prevent.
   */
  secondaryRail?: ReactNode
}

/**
 * EWO-109 (Part B/E) — the Environmental Mount, one of the three
 * primitives QDS-004 Part G approved for extraction. Owns exactly what
 * EWO-108 discovered: a continuous environment mount that extends past a
 * conventional hero band, plus a bottom gradient fade so the room
 * dissolves into the page background rather than cutting off hard (QDS-004
 * Part F.1's "architectural continuation vs. photographic extension").
 *
 * Knows only an `EnvironmentId` (the same typed asset identifier every
 * other environment consumer in the app already uses) — no ship, fleet,
 * or intelligence data ever reaches this component.
 */
export default function StationEnvironmentMount({
  environmentId,
  children,
  minHeightClassName = 'lg:min-h-[560px]',
  fadeHeightClassName = 'h-28 lg:h-40',
  bordered = true,
  secondaryRail,
}: StationEnvironmentMountProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl ${bordered ? 'lg:border lg:border-white/15' : ''} ${minHeightClassName} flex flex-col lg:flex-row lg:items-stretch`}
      data-testid="station-environment-mount"
    >
      <PageEnvironment id={environmentId} />
      <div className={`absolute inset-x-0 bottom-0 ${fadeHeightClassName} bg-gradient-to-b from-transparent to-bg pointer-events-none z-[1]`} aria-hidden="true" />
      {children}
      <div className="relative z-10 flex-1 min-w-0 min-h-[80px] lg:min-h-0" aria-hidden="true" />
      {secondaryRail}
    </div>
  )
}
