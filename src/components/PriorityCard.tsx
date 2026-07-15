import type { Ship } from '../types'
import type { BuildProgressResult } from '../utils/buildProgress'
import ShipRecordCard from './ShipRecordCard'

/**
 * @deprecated EWO-032 — RETIRED. Mission Control no longer renders this
 * component; it now consumes the canonical `ShipCard` (src/components/
 * ShipCard.tsx), the same component Fleet Dashboard uses, with the
 * "PRIORITY N" label rendered as a sibling above the card instead of a
 * badge inside it. Kept in place, not deleted, per EWO-032's explicit
 * instruction pending Commander migration verification — safe to delete
 * (along with ShipRecordCard, its only remaining consumer) once approved.
 * See docs/UI_ARCHITECTURE.md's canonical Ship Card section.
 *
 * Mission Control's former thin wrapper around the shared ShipRecordCard
 * template (EWO-009) — added only the "PRIORITY N" rank badge, which was
 * a Mission-Control-specific concept kept out of the reusable component
 * itself.
 */
export default function PriorityCard({ ship, buildName, rank, progress }: { ship: Ship; buildName: string; rank: number; progress: BuildProgressResult }) {
  return (
    <ShipRecordCard
      ship={ship}
      buildName={buildName}
      progress={progress}
      badge={<span className="font-mono text-[10px] text-cyan/80 tracking-widest">PRIORITY {rank}</span>}
    />
  )
}
