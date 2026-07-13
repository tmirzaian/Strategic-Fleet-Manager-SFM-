/**
 * Typed asset infrastructure (Mission M-022).
 *
 * Application code never references a raw production file path — it
 * references a semantic identifier (an `EnvironmentId`, a branding key, a
 * manufacturer code) and this config layer resolves it to an actual
 * `public/assets/...` path, with a presentation default and a graceful
 * missing-asset fallback. See docs/ASSET_PIPELINE.md.
 */

/** One entry per page this mission establishes environment support for — kept in exact sync with `public/assets/environments/<id>/`. */
export type EnvironmentId = 'mission-control' | 'fleet-dashboard' | 'ship-detail' | 'hangar-inventory' | 'loadout-manager' | 'decision-center' | 'captain-log'

export const ENVIRONMENT_IDS: readonly EnvironmentId[] = [
  'mission-control',
  'fleet-dashboard',
  'ship-detail',
  'hangar-inventory',
  'loadout-manager',
  'decision-center',
  'captain-log',
]

/**
 * Every field is optional — a production package rarely ships all four
 * widths at once, and `PageEnvironment` degrades to whatever's actually
 * present (see resolveResponsiveSource in environmentAssets.ts).
 */
export interface ResponsiveEnvironmentSource {
  /** ~3840px wide. */
  desktop4k?: string
  /** ~2560px wide. */
  desktop?: string
  /** ~1920px wide. */
  tablet?: string
  /** ~1280px wide. */
  mobile?: string
}

export interface EnvironmentPresentation {
  /** 0-1. */
  opacity: number
  /** CSS filter brightness(), 1 = unchanged. Must be > 0. */
  brightness: number
  /** CSS filter contrast(), 1 = unchanged. Must be > 0. */
  contrast: number
  /** CSS filter saturate(), 1 = unchanged. Must be >= 0. */
  saturation: number
  /** CSS filter blur() radius in pixels. Must be >= 0. */
  blurPx: number
  /** CSS background-position value. */
  position: string
  /** Root-relative public path to an overlay image layered above the background. */
  overlay?: string
}

export interface EnvironmentAssetDefinition {
  id: EnvironmentId
  /** Human-readable label — never shown to players, only for tooling/debugging. */
  label: string
  sources: ResponsiveEnvironmentSource
  presentation: EnvironmentPresentation
  /** Definitions may exist ahead of real artwork — `enabled: false` renders nothing. */
  enabled: boolean
  /** Which environment to fall back to when this one is disabled or has no usable source — 'none' renders nothing. */
  fallback?: EnvironmentId | 'none'
}

/** Manufacturer directory codes under public/assets/fleet-registry/ — lowercase, kebab-case. */
export type FleetRegistryManufacturerSlug =
  | 'aegis'
  | 'anvil'
  | 'argo'
  | 'consolidated-outland'
  | 'crusader'
  | 'drake'
  | 'esperia'
  | 'gatac'
  | 'greycat'
  | 'kruger'
  | 'misc'
  | 'origin'
  | 'rsi'
  | 'tumbril'
  | 'misc-manufacturers'

export interface FleetRegistryImageRequest {
  /** Manufacturer badge code as produced by src/utils/manufacturerLogo.ts (e.g. "AEGS", "ARGO") — resolved to a directory slug internally, never assumed pre-lowercased. */
  manufacturerCode: string
  shipSlug: string
  variantSlug?: string
}

export interface FleetRegistryImageResult {
  /** Undefined when no approved image exists for this tier — e.g. the
   * generic-fallback tier before the approved BA-003A-01 Fleet Registry
   * placeholder master is delivered into the repo. Callers pass this
   * straight through as ShipImage's `fallbackSrc`, which already renders
   * a safe neutral icon treatment when both `src` and `fallbackSrc` are
   * empty — never a broken image, never the deprecated presentation-board
   * artwork at SHIP_PLACEHOLDER_URL. */
  url: string | undefined
  /** Which tier of the fallback order actually resolved — useful for tooling/tests, never shown to players. */
  source: 'fleet-registry' | 'ship-override' | 'ship-image' | 'generic-fallback'
}

/** Semantic branding asset keys — never a raw path in application code. */
export type BrandingAssetKey = 'primaryLogo' | 'compactMark' | 'sidebarCommissioningMark' | 'monochromeMark' | 'appIcon'

export interface BrandingAssetDefinition {
  key: BrandingAssetKey
  label: string
  /** Root-relative public path, or undefined when no asset has been approved yet (Principle 4: missing optional assets must never crash). */
  src?: string
  /** True once a real, approved asset exists at `src`. */
  enabled: boolean
}

/**
 * Semantic identifiers for WorkflowDestinationCard's future fixed
 * illustration (EWO-011). Each maps to one operational workflow
 * destination on Mission Control — never a raw path in application code.
 */
export type WorkflowIllustrationId = 'decision-center-found-loot' | 'quick-update-hangar'

export interface WorkflowIllustrationDefinition {
  id: WorkflowIllustrationId
  label: string
  /** Root-relative public path, or undefined until a Commander-approved illustration is delivered. */
  src?: string
  /** True once a real, approved illustration exists at `src`. */
  enabled: boolean
}
