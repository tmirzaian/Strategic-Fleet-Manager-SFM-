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
  // backdrop. Because legibility is now handled by the bay's own glass
  // panels and edge vignette — not by low opacity alone — this reads
  // brighter/more vivid than the Amendment-0 full-page value (0.28/0.8);
  // a slight blur (`blurPx: 1`) adds the same "subtle atmospheric haze"
  // the work order's Lighting section asks for.
  'decision-center': definition('decision-center', 'Decision Center', {
    sources: { desktop: assetPath('environments/decision-center/decision-center.webp') },
    enabled: true,
    presentation: { ...DEFAULT_PRESENTATION, opacity: 0.55, brightness: 0.95, contrast: 1.05, saturation: 1.05, blurPx: 1 },
  }),
  'captain-log': definition('captain-log', "Captain's Log"),
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
