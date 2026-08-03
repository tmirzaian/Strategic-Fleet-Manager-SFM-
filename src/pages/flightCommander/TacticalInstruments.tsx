import type { FlightCommanderPresentation } from '../../utils/flightCommanderPresentation'
import { MountedInstrumentRegion, MountedInstrument } from '../../components/stationShell'

/**
 * EWO-108 (Part E) + EWO-109 (Part D) — the four certified EWO-104
 * metrics (source/definitions/values all unchanged, read straight off
 * `FlightCommanderPresentation` — no new calculation). This component now
 * owns only Flight-Commander-specific content: which four metrics exist
 * and what their labels/values are. The recessed-housing/hairline/
 * corner-tick presentation itself moved to the shell's `MountedInstrument`
 * (EWO-109 Part B/E) — this file is a thin content-mapping layer, not a
 * visual implementation, per "Stations compose the shell rather than
 * modify it."
 */
export default function TacticalInstruments({ presentation }: { presentation: FlightCommanderPresentation }) {
  const instruments = [
    { id: 'source-ships-identified', label: 'Source Ships Identified', value: presentation.sourceShipsIdentifiedCount },
    { id: 'priority-components', label: 'Priority Components', value: presentation.matchedDemandComponentCount },
    { id: 'fleet-requirements', label: 'Fleet Requirements', value: presentation.totalFleetRequirementUnits },
    { id: 'high-value-targets', label: 'High-Value Targets', value: presentation.highValueTargetCount },
  ]
  return (
    <MountedInstrumentRegion>
      {instruments.map((instrument) => (
        <MountedInstrument key={instrument.id} label={instrument.label} value={instrument.value} testId={`summary-card-${instrument.id}`} />
      ))}
    </MountedInstrumentRegion>
  )
}
