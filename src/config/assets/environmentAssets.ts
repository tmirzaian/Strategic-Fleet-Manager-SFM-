import { assetPath } from './assetPaths'
import { ENVIRONMENT_IDS, type EnvironmentAssetDefinition, type EnvironmentId, type EnvironmentPresentation, type ResponsiveEnvironmentSource } from './types'

/**
 * Conservative, readability-first defaults — low opacity, no blur, no
 * contrast/saturation push — so that if a definition is ever enabled
 * before its artwork has been proofed for text contrast, it stays subtle
 * rather than fighting the page content in front of it.
 */
const DEFAULT_PRESENTATION: EnvironmentPresentation = {
  opacity: 0.16,
  brightness: 0.7,
  contrast: 1,
  saturation: 1,
  blurPx: 0,
  position: 'center',
}

function definition(id: EnvironmentId, label: string, overrides: Partial<Omit<EnvironmentAssetDefinition, 'id' | 'label'>> = {}): EnvironmentAssetDefinition {
  return {
    id,
    label,
    sources: {},
    presentation: DEFAULT_PRESENTATION,
    enabled: false,
    fallback: 'none',
    ...overrides,
  }
}

/**
 * Every definition ships `enabled: false` — Mission M-022 is
 * infrastructure only ("Do not reference finished artwork that does not
 * exist"). Flipping a definition to `enabled: true` with real `sources`
 * is the entire integration step for a future production art handoff;
 * see docs/ASSET_PIPELINE.md's "production-package handoff" section.
 */
export const ENVIRONMENT_ASSETS: Record<EnvironmentId, EnvironmentAssetDefinition> = {
  // EWO-035 — Beta artwork integration. Commander-supplied "Operations
  // Wall" illustration, delivered as a single production file (no
  // per-breakpoint variants yet), so it's wired into the `desktop` tier —
  // `resolveResponsiveSource()`'s widest-available-first order means this
  // is exactly what renders at every viewport until narrower variants are
  // ever added. Beta 1.0 artwork only; Release 2.0 Quartermaster Edition
  // may replace this file later without any consumer change (same
  // resolution boundary as src/data/shipImageRegistry.ts's own
  // Beta-vs-Release-2.0 note).
  'mission-control': definition('mission-control', 'Mission Control', {
    sources: { desktop: assetPath('environments/mission-control/mission-control-operations-wall.webp') },
    enabled: true,
    // EWO-035A-R2 — full-strength, Commander-approved final state. The
    // shared DEFAULT_PRESENTATION (0.16/0.7) and the two intermediate
    // corrections (EWO-035A: 0.4/0.85; EWO-035A-R1: 0.85/1.0, which also
    // fixed a second compounding darkening layer — the hero-root gradient
    // in src/pages/MissionControl.tsx, since removed entirely, see that
    // file) were all still muting this specific, now-live production image
    // more than the Commander wants. No filtering at all now — opacity,
    // brightness, contrast, and saturation are each neutral/unchanged
    // (1.0/1/1), so the artwork renders exactly as supplied. Legibility for
    // the Fleet Readiness column is handled entirely by its own glass
    // backdrop (src/pages/MissionControl.tsx), not by dimming the hero.
    presentation: { ...DEFAULT_PRESENTATION, opacity: 1.0, brightness: 1.0, contrast: 1.0, saturation: 1.0 },
  }),
  'fleet-dashboard': definition('fleet-dashboard', 'Fleet Dashboard'),
  'ship-detail': definition('ship-detail', 'Ship Detail'),
  'hangar-inventory': definition('hangar-inventory', 'Hangar Inventory'),
  'loadout-manager': definition('loadout-manager', 'Loadout Manager'),
  // UX-003B Amendment A — Commander-supplied "Technical Evaluation"
  // forensic-lab artwork (robotic inspection arms, holographic
  // diagnostics, blue/amber lighting, deliberately clean center aisle),
  // mounted inside its own bounded Technical Evaluation Bay
  // (`EnvironmentBay`, see DecisionCenter.tsx) rather than as a page-wide
  // backdrop.
  //
  // EWO-095A — "Canonical Image Presentation & Environmental Clarity."
  // The 0.55/0.95/1.05/1.05/blurPx:1 values above were tuned when
  // legibility depended partly on dimming the plate itself; the canonical
  // rule is now "environment plate: crisp, unblurred, visible at intended
  // fidelity" — legibility is the foreground panels' job (semi-opaque
  // graphite + backdrop-blur, see DecisionCenter.tsx's own panel classes),
  // not the artwork's. blurPx -> 0 (no atmospheric-haze blur on the plate
  // itself anymore); opacity/brightness/contrast/saturation -> a very
  // light, deliberately near-imperceptible uniform wash (0.95/1/1/1)
  // rather than the heavier 0.55 — "preserve a configurable wash only
  // where needed," not remove the mechanism outright.
  'decision-center': definition('decision-center', 'Decision Center', {
    sources: { desktop: assetPath('environments/decision-center/decision-center.webp') },
    enabled: true,
    presentation: { ...DEFAULT_PRESENTATION, opacity: 0.95, brightness: 1.0, contrast: 1.0, saturation: 1.0, blurPx: 0 },
  }),
  'captain-log': definition('captain-log', "Captain's Log"),

  // Chief Architect Asset Handoff — bounded empty-state "room" artwork,
  // each consumed via a compact EnvironmentBay (not the full-page hero
  // pattern 'mission-control' itself uses).
  //
  // Revision 2 — masters replaced with 3344x1882 originals (the earlier
  // 1672x941 masters are retired); `tablet` (~1920) is now a real,
  // non-upscaled source alongside `mobile` (~1280), so
  // resolveResponsiveSource() picks the sharper 1920 tier by default.
  // `desktop`/`desktop4k` remain deliberately unpopulated — 2560/3840
  // weren't requested this round even though the master could support
  // 2560 without upscaling (explicit product scope, see
  // scripts/generateEnvironmentAssets.ts's own comment).
  //
  // Presentation tuned against the new, higher-resolution masters, then
  // retuned again under EWO-095A's canonical rule (crisp/unblurred plate,
  // legibility from the foreground card, not from dimming the artwork):
  // opacity/brightness/contrast/saturation now match 'decision-center'
  // exactly (0.95/1/1/1, a very light wash) instead of the heavier
  // 0.55/0.95/1.05/1.05. The bay's own edge vignette (separate from this
  // presentation block — see EnvironmentBay's `vignetteOpacity` prop) now
  // just uses the bay's own reduced default; no per-call override needed.
  'mission-control-empty-priority': definition('mission-control-empty-priority', 'Mission Control — Empty Top Priority Ship', {
    sources: {
      tablet: assetPath('environments/mission-control-empty-priority/mission-control-empty-priority-background-1920.webp'),
      mobile: assetPath('environments/mission-control-empty-priority/mission-control-empty-priority-background-1280.webp'),
    },
    enabled: true,
    presentation: { ...DEFAULT_PRESENTATION, opacity: 0.95, brightness: 1.0, contrast: 1.0, saturation: 1.0, blurPx: 0 },
  }),
  'fleet-dashboard-empty': definition('fleet-dashboard-empty', 'Fleet Dashboard — Empty Fleet', {
    sources: {
      tablet: assetPath('environments/fleet-dashboard-empty/fleet-dashboard-empty-background-1920.webp'),
      mobile: assetPath('environments/fleet-dashboard-empty/fleet-dashboard-empty-background-1280.webp'),
    },
    enabled: true,
    presentation: { ...DEFAULT_PRESENTATION, opacity: 0.95, brightness: 1.0, contrast: 1.0, saturation: 1.0, blurPx: 0 },
  }),
  'hangar-inventory-empty': definition('hangar-inventory-empty', 'Hangar Inventory — Empty Inventory', {
    sources: {
      tablet: assetPath('environments/hangar-inventory-empty/hangar-inventory-empty-background-1920.webp'),
      mobile: assetPath('environments/hangar-inventory-empty/hangar-inventory-empty-background-1280.webp'),
    },
    enabled: true,
    presentation: { ...DEFAULT_PRESENTATION, opacity: 0.95, brightness: 1.0, contrast: 1.0, saturation: 1.0, blurPx: 0 },
  }),

  // EWO-104 Amendment 2 (Part F) — Flight Commander's hero. Same
  // full-strength, zero-filter treatment 'mission-control' settled on
  // (EWO-035A-R2): "the goal is zero shading over the loaded image, not a
  // fallback tone" — legibility for the anchored summary cards comes from
  // their own glass backdrop (see FlightCommander.tsx), never from
  // dimming the artwork. blurPx: 0, no vignette layer.
  // EWO-111 (Part A) — the V2 plate: a genuine second, distinct scene
  // (a visible bulkhead threshold on the left, opening into the CIC)
  // delivered directly as a web-ready 1672-wide .webp — no archival PNG
  // master exists for this one (see scripts/generateEnvironmentAssets.ts's
  // own comment on this spec). The delivered file is used directly as
  // the `tablet` source (already at web resolution, resizing it down
  // and calling that "1920" would be meaningless); `mobile` is the one
  // real derivative the pipeline could produce from it (1280, the only
  // requested tier at or below the source's own 1672px width). Same
  // full-strength, zero-filter treatment as before — the new plate's
  // own left-dark/right-detail composition already gives the Mounted
  // Briefing Wall the same legible negative space the original plate
  // did, so no shading is needed to compensate for it either.
  'flight-commander': definition('flight-commander', 'Flight Commander', {
    sources: {
      tablet: assetPath('environments/flight-commander/flight-commander-v2.webp'),
      mobile: assetPath('environments/flight-commander/flight-commander-v2-background-1280.webp'),
    },
    enabled: true,
    presentation: { ...DEFAULT_PRESENTATION, opacity: 1.0, brightness: 1.0, contrast: 1.0, saturation: 1.0, blurPx: 0 },
  }),
}

export function getEnvironmentDefinition(id: EnvironmentId): EnvironmentAssetDefinition {
  return ENVIRONMENT_ASSETS[id]
}

/** True when a definition is enabled and has at least one usable image source. */
export function isEnvironmentUsable(def: EnvironmentAssetDefinition): boolean {
  return def.enabled && Object.values(def.sources).some((src) => typeof src === 'string' && src.trim() !== '')
}

/**
 * Widest-available-first — a page never needs to know which specific
 * widths a production package shipped. Returns undefined when no source
 * exists at all (a fully "coming soon" definition), which callers must
 * treat as "render nothing", never as an error.
 */
export function resolveResponsiveSource(sources: ResponsiveEnvironmentSource): string | undefined {
  return sources.desktop4k || sources.desktop || sources.tablet || sources.mobile || undefined
}

const VALID_POSITION_KEYWORDS = new Set(['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'])

/**
 * Validates presentation values are within sane, renderable bounds.
 * Deliberately permissive on `position` (accepts any non-empty CSS
 * background-position value, not just the keyword set) — the keyword set
 * is only used to short-circuit the common case.
 */
export function isValidPresentation(presentation: EnvironmentPresentation): boolean {
  const { opacity, brightness, contrast, saturation, blurPx, position } = presentation
  if (!(opacity >= 0 && opacity <= 1)) return false
  if (!(brightness > 0)) return false
  if (!(contrast > 0)) return false
  if (!(saturation >= 0)) return false
  if (!(blurPx >= 0)) return false
  if (typeof position !== 'string' || position.trim() === '') return false
  return true
}

/** Every EnvironmentAssetDefinition in the registry has valid presentation values and a real id. Used by tests and safe to call at module init in dev. */
export function validateEnvironmentRegistry(): string[] {
  const errors: string[] = []
  for (const id of ENVIRONMENT_IDS) {
    const def = ENVIRONMENT_ASSETS[id]
    if (def.id !== id) errors.push(`Registry key "${id}" does not match definition.id "${def.id}".`)
    if (!isValidPresentation(def.presentation)) errors.push(`"${id}" has invalid presentation values.`)
  }
  return errors
}

/**
 * Re-exported so callers building a `sources` value for a future
 * definition go through the same traversal/normalization guard as every
 * other asset path, rather than hand-writing a "/assets/..." string.
 */
export { assetPath }
