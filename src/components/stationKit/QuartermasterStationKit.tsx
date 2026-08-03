import { Rocket, ShieldCheck, Zap, Wrench, Search, Filter } from 'lucide-react'
import MountedInstrument from './MountedInstrument'
import OfficerBriefingBlock from './OfficerBriefingBlock'
import StructuralDivider from './StructuralDivider'
import CompartmentHeader from './CompartmentHeader'
import OperationalStatusBanner from './OperationalStatusBanner'
import MountedWorkspacePanel from './MountedWorkspacePanel'
import QuartermasterIconHousing from './QuartermasterIconHousing'
import { BlueprintGridOverlay, TacticalCirclesOverlay, EngineeringMarksOverlay, ScanLinesOverlay, CompartmentFrameOverlay, HolographicDepthOverlay } from './EnvironmentalOverlays'
import type { OperationalStatusVariant } from './OperationalStatusBanner'

const ALL_STATUS_VARIANTS: OperationalStatusVariant[] = [
  'mission-ready',
  'operational',
  'standing-watch',
  'attention-required',
  'maintenance-required',
  'warning',
  'information',
  'critical',
]

function ShowcaseSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-display font-bold text-cyan uppercase tracking-widest">{title}</h2>
      {children}
    </section>
  )
}

/**
 * EWO-110 (Part I) — `QuartermasterStationKit.tsx`, the Component
 * Showcase. Not routed anywhere (no entry in `App.tsx`), no business
 * logic, no store access — every value below is invented example data,
 * purely to demonstrate the Station Kit's own components together. This
 * is the design authority future EWOs should consult; see
 * `src/components/stationKit/__tests__/StationKit.test.tsx` for the
 * automated proof that it renders without a router or store.
 *
 * Part D's own worked examples ("MISSION CONTROL / Fleet Operations
 * Bridge," etc.) are reproduced here verbatim as illustrations only —
 * this file does not change any real Station's shipped title text (see
 * docs/EWO-110-Quartermaster-Station-Kit.md for that distinction).
 */
export default function QuartermasterStationKit() {
  return (
    <div className="max-w-5xl mx-auto space-y-10 p-8 bg-bg text-white">
      <div>
        <h1 className="text-3xl font-display font-bold text-white">Quartermaster Station Kit</h1>
        <p className="text-sm text-muted mt-1">EWO-110 — every reusable Station Kit component, in one visual reference. Not a page. Not routed.</p>
      </div>

      <ShowcaseSection title="Part D — Compartment Header">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="panel p-4">
            <CompartmentHeader designation="Mission Control" title="Fleet Operations Bridge" officerDesignation="Executive Officer Reporting" />
          </div>
          <div className="panel p-4">
            <CompartmentHeader designation="Ship Management" title="Maintenance Bay" subtitle="One vessel, full doctrinal review." />
          </div>
          <div className="panel p-4">
            <CompartmentHeader designation="Hangar Inventory" title="Quartermaster Stores" officerDesignation="Quartermaster Reporting" />
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection title="Part A — Mounted Instrument">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <MountedInstrument title="Source Ships Identified" value={6} icon={Rocket} />
          <MountedInstrument title="Fleet Readiness" value="94%" icon={ShieldCheck} status="success" trend="up" />
          <MountedInstrument title="Power Draw" value="118%" icon={Zap} status="warning" trend="up" />
          <MountedInstrument title="Maintenance Backlog" value={3} icon={Wrench} status="gold" trend="down" />
        </div>
      </ShowcaseSection>

      <ShowcaseSection title="Part B — Officer Briefing Block">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="panel p-4">
            <p className="text-xs text-muted mb-2">Example: Mission Control</p>
            <OfficerBriefingBlock
              standingCondition="Operations Standing By"
              summary="12 ships active, 94% fleet readiness."
              concern="3 vessels have unresolved maintenance requirements."
              recommendation="Review Ship Management for the affected vessels."
              nextAction="Open Ship Management"
            />
          </div>
          <div className="panel p-4">
            <p className="text-xs text-muted mb-2">Example: Decision Center (narrow — most slots omitted)</p>
            <OfficerBriefingBlock recommendation="Store in Hangar — no reservation required." />
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection title="Part C — Structural Divider">
        <div className="panel p-4 space-y-4">
          <p className="text-xs text-muted">horizontal</p>
          <StructuralDivider variant="horizontal" />
          <p className="text-xs text-muted">mounted</p>
          <StructuralDivider variant="mounted" />
          <p className="text-xs text-muted">section-break</p>
          <StructuralDivider variant="section-break" label="Intelligence Status" />
          <div className="flex items-stretch gap-4 h-12">
            <p className="text-xs text-muted">vertical -&gt;</p>
            <StructuralDivider variant="vertical" />
            <p className="text-xs text-muted">&lt;- between two side-by-side blocks</p>
          </div>
        </div>
      </ShowcaseSection>

      <ShowcaseSection title="Part E — Operational Status Banner">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {ALL_STATUS_VARIANTS.map((variant) => (
            <OperationalStatusBanner key={variant} variant={variant} description="Example description text for this variant." />
          ))}
        </div>
      </ShowcaseSection>

      <ShowcaseSection title="Part F — Environmental Overlay Library">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { name: 'Blueprint Grid', Overlay: BlueprintGridOverlay },
            { name: 'Tactical Circles', Overlay: TacticalCirclesOverlay },
            { name: 'Engineering Marks', Overlay: EngineeringMarksOverlay },
            { name: 'Scan Lines', Overlay: ScanLinesOverlay },
            { name: 'Compartment Frame', Overlay: CompartmentFrameOverlay },
            { name: 'Holographic Depth', Overlay: HolographicDepthOverlay },
          ].map(({ name, Overlay }) => (
            <div key={name} className="relative h-24 rounded-md border border-white/10 bg-black/40 overflow-hidden flex items-center justify-center">
              <Overlay />
              <span className="relative z-10 text-[10px] uppercase tracking-widest text-muted">{name}</span>
            </div>
          ))}
        </div>
      </ShowcaseSection>

      <ShowcaseSection title="Part G — Mounted Workspace Panel">
        <MountedWorkspacePanel
          title="Example Panel"
          toolbar={
            <>
              <Search size={14} className="text-muted" aria-hidden="true" />
              <Filter size={14} className="text-muted" aria-hidden="true" />
            </>
          }
          footer={<p className="text-xs text-muted">Footer slot — e.g. pagination or a summary line.</p>}
        >
          <p className="text-sm text-white/80">Content slot — any Station's own workspace content renders here.</p>
        </MountedWorkspacePanel>
      </ShowcaseSection>

      <ShowcaseSection title="Part H — Quartermaster Icon Housing">
        <div className="flex items-center gap-2">
          <QuartermasterIconHousing icon={Rocket} label="Example active icon" active />
          <QuartermasterIconHousing icon={ShieldCheck} label="Example inactive icon" active={false} />
          <QuartermasterIconHousing icon={Wrench} label="Example small icon" active size="sm" />
        </div>
      </ShowcaseSection>
    </div>
  )
}
