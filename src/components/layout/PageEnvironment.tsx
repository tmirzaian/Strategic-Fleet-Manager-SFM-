import { getEnvironmentDefinition, isEnvironmentUsable, resolveResponsiveSource } from '../../config/assets/environmentAssets'
import type { EnvironmentAssetDefinition, EnvironmentId } from '../../config/assets/types'

export interface PageEnvironmentProps {
  id: EnvironmentId
  className?: string
}

function resolveUsableDefinition(id: EnvironmentId, depth = 0): EnvironmentAssetDefinition | undefined {
  // Bounded recursion — a two-definition fallback cycle (A -> B -> A)
  // must never hang; three hops is more than enough for any real chain.
  if (depth > 3) return undefined

  const def = getEnvironmentDefinition(id)
  // An id that doesn't exist in the registry at all (only reachable at
  // runtime — TypeScript already prevents this at compile time) must
  // degrade the same as any other missing/unusable asset, never throw.
  if (!def) return undefined
  if (isEnvironmentUsable(def)) return def
  if (def.fallback && def.fallback !== 'none') return resolveUsableDefinition(def.fallback, depth + 1)
  return undefined
}

/**
 * Purely decorative, page-specific background layer (Mission M-022). Not
 * mounted anywhere yet — every EnvironmentAssetDefinition ships
 * `enabled: false`, so this component currently always renders `null`
 * regardless of which page it's given. See docs/ASSET_PIPELINE.md for
 * the future integration point.
 *
 * Responsibilities are strictly limited to presentation:
 *   - resolves the typed environment definition for `id`;
 *   - renders nothing when disabled, missing, or unusable (including via
 *     the fallback chain);
 *   - absolutely positioned, full-bleed within its nearest positioned
 *     ancestor — never affects document flow or page padding/layout;
 *   - `pointer-events: none` and `aria-hidden="true"` — never
 *     intercepts interaction or is announced to assistive tech;
 *   - applies presentation (opacity/brightness/contrast/saturation/blur/
 *     position) and an optional overlay layer.
 * It owns no card layout, navigation, or business logic — callers keep
 * their existing page structure entirely unchanged.
 */
export default function PageEnvironment({ id, className }: PageEnvironmentProps) {
  const def = resolveUsableDefinition(id)
  if (!def) return null

  const source = resolveResponsiveSource(def.sources)
  if (!source) return null

  const { opacity, brightness, contrast, saturation, blurPx, position, overlay } = def.presentation

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ''}`}
      data-environment-id={def.id}
    >
      <div
        className="absolute inset-0 bg-no-repeat bg-cover"
        style={{
          backgroundImage: `url(${source})`,
          backgroundPosition: position,
          opacity,
          filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) blur(${blurPx}px)`,
        }}
      />
      {overlay && (
        <div
          className="absolute inset-0 bg-no-repeat bg-cover"
          style={{ backgroundImage: `url(${overlay})` }}
        />
      )}
    </div>
  )
}
