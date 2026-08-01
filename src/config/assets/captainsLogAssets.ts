import { assetPath } from './assetPaths'
import type { CaptainsLogAccentDefinition, CaptainsLogAccentId } from './types'

function definition(id: CaptainsLogAccentId, label: string, overrides: Partial<Omit<CaptainsLogAccentDefinition, 'id' | 'label'>> = {}): CaptainsLogAccentDefinition {
  return { id, label, sources: {}, enabled: false, ...overrides }
}

/**
 * Chief Architect Asset Handoff — Captain's Log certification card's own
 * low-opacity CSS background accent. See `CaptainsLogAccentId`'s own doc
 * comment (types.ts) for why this is a distinct registry from
 * `EnvironmentId`/`ShipManagementIllustrationId` rather than reusing
 * either. Master delivered at 1706x922 — below the originally-requested
 * 2400 tier, so only `wide` (1600) and `narrow` (1200) sources exist per
 * scripts/generateEnvironmentAssets.ts's no-upscale rule.
 */
export const CAPTAINS_LOG_ACCENTS: Record<CaptainsLogAccentId, CaptainsLogAccentDefinition> = {
  certification: definition('certification', "Captain's Log — Certification Card Accent", {
    sources: {
      wide: assetPath('illustrations/captains-log-certification/captains-log-certification-accent-1600.webp'),
      narrow: assetPath('illustrations/captains-log-certification/captains-log-certification-accent-1200.webp'),
    },
    enabled: true,
  }),
}

export function getCaptainsLogAccent(id: CaptainsLogAccentId): CaptainsLogAccentDefinition {
  return CAPTAINS_LOG_ACCENTS[id]
}

/** Widest-available-first, mirroring `resolveResponsiveSource`'s own
 * convention for environments. Resolved src, or undefined when this id
 * isn't enabled/has no usable source yet — callers must render their
 * existing plain-card styling in that case, never a broken background. */
export function resolveCaptainsLogAccentSource(id: CaptainsLogAccentId): string | undefined {
  const def = CAPTAINS_LOG_ACCENTS[id]
  if (!def.enabled) return undefined
  return def.sources.wide || def.sources.narrow || undefined
}
