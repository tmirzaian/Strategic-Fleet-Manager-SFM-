import { CompartmentHeader } from '../../components/stationKit'

/**
 * EWO-108 (Part D) + EWO-110 (Part D) — the mounted Station briefing.
 * Station Identification is carried entirely by "Flight Commander" plus
 * this compartment's own established voice (QDS-003 Part C.1) — no
 * avatar, fictional crew name, greeting, or conversational prose.
 * Operational Condition is the one required line (QDS-003 Part C.2); the
 * Command Summary line only renders once real intelligence exists to
 * summarize — Standing Watch (Part L) carries its own full report body
 * instead of a summary line here, so the two states never say the same
 * thing twice.
 *
 * Now a thin composition of the Station Kit's canonical
 * `CompartmentHeader` (EWO-110 Part D) — every className below moved
 * verbatim into that shared component; this file supplies only Flight-
 * Commander-specific text.
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
    <CompartmentHeader
      designation="Flight Commander"
      title={active ? 'Target Intelligence Available' : 'Standing Watch'}
      subtitle={
        active
          ? `${sourceShipsIdentifiedCount} source vessel${sourceShipsIdentifiedCount === 1 ? '' : 's'} tracked across ${matchedDemandComponentCount} priority component${
              matchedDemandComponentCount === 1 ? '' : 's'
            }.`
          : undefined
      }
    />
  )
}
