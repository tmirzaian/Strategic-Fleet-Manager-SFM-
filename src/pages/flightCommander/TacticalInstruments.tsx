import type { FlightCommanderPresentation } from '../../utils/flightCommanderPresentation'
import { MountedInstrumentRegion } from '../../components/stationShell'
import { MountedInstrument } from '../../components/stationKit'

/**
 * EWO-108 (Part E) + EWO-109 (Part D) + EWO-110 (Part A) — the four
 * certified EWO-104 metrics (source/definitions/values all unchanged,
 * read straight off `FlightCommanderPresentation` — no new calculation).
 * This component now owns only Flight-Commander-specific content: which
 * four metrics exist and what their titles/values are. The recessed-
 * housing/hairline/corner-tick presentation itself lives in the Station
 * Kit's canonical `MountedInstrument` (EWO-110 Part A, superseding
 * EWO-109's own narrower shell-local version) — this file is a thin
 * content-mapping layer, not a visual implementation.
 */
export default function TacticalInstruments({ presentation }: { presentation: FlightCommanderPresentation }) {
  const instruments = [
    { id: 'source-ships-identified', title: 'Source Ships Identified', value: presentation.sourceShipsIdentifiedCount },
    { id: 'priority-components', title: 'Priority Components', value: presentation.matchedDemandComponentCount },
    { id: 'fleet-requirements', title: 'Fleet Requirements', value: presentation.totalFleetRequirementUnits },
    { id: 'high-value-targets', title: 'High-Value Targets', value: presentation.highValueTargetCount },
  ]
  return (
    <MountedInstrumentRegion>
      {instruments.map((instrument) => (
        <MountedInstrument key={instrument.id} title={instrument.title} value={instrument.value} testId={`summary-card-${instrument.id}`} />
      ))}
    </MountedInstrumentRegion>
  )
}
