/**
 * EWO-108 (Part D) — the mounted Station briefing. Station Identification
 * is carried entirely by "FLIGHT COMMANDER" plus this compartment's own
 * established voice (QDS-003 Part C.1) — no avatar, fictional crew name,
 * greeting, or conversational prose. Operational Condition is the one
 * required line (QDS-003 Part C.2); the Command Summary line only renders
 * once real intelligence exists to summarize — Standing Watch (Part L)
 * carries its own full report body instead of a summary line here, so the
 * two states never say the same thing twice.
 */
export default function StationBriefingHeader({
  active,
  sourceShipsIdentifiedCount,
  matchedDemandComponentCount,
}: {
  active: boolean
  sourceShipsIdentifiedCount: number
  matchedDemandComponentCount: number
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Flight Commander</p>
      <h1 className="text-2xl font-display font-bold text-white">{active ? 'Target Intelligence Available' : 'Standing Watch'}</h1>
      {active && (
        <p className="text-sm text-muted mt-1.5">
          {sourceShipsIdentifiedCount} source vessel{sourceShipsIdentifiedCount === 1 ? '' : 's'} tracked across {matchedDemandComponentCount} priority component
          {matchedDemandComponentCount === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  )
}
