/**
 * EWO-110 — the Quartermaster Station Kit's public surface. Every export
 * here is presentation infrastructure — no business logic, no resolver
 * calls, no workflow. See docs/EWO-110-Quartermaster-Station-Kit.md for
 * ownership, composition rules, and migration guidance.
 */
export { default as MountedInstrument } from './MountedInstrument'
export type { MountedInstrumentProps, MountedInstrumentTrend } from './MountedInstrument'
export { default as OfficerBriefingBlock } from './OfficerBriefingBlock'
export type { OfficerBriefingBlockProps } from './OfficerBriefingBlock'
export { default as StructuralDivider } from './StructuralDivider'
export type { StructuralDividerProps, StructuralDividerVariant } from './StructuralDivider'
export { default as CompartmentHeader } from './CompartmentHeader'
export type { CompartmentHeaderProps } from './CompartmentHeader'
export { default as OperationalStatusBanner } from './OperationalStatusBanner'
export type { OperationalStatusBannerProps, OperationalStatusVariant } from './OperationalStatusBanner'
export { default as MountedWorkspacePanel } from './MountedWorkspacePanel'
export type { MountedWorkspacePanelProps } from './MountedWorkspacePanel'
export { default as QuartermasterIconHousing } from './QuartermasterIconHousing'
export type { QuartermasterIconHousingProps } from './QuartermasterIconHousing'
export {
  BlueprintGridOverlay,
  TacticalCirclesOverlay,
  EngineeringMarksOverlay,
  ScanLinesOverlay,
  CompartmentFrameOverlay,
  HolographicDepthOverlay,
} from './EnvironmentalOverlays'
