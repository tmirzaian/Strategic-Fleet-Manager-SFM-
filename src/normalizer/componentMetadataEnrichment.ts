import type { CanonicalLoadoutNode } from './loadoutNodeAdapter'
import type { NormalizationWarning } from '../engine/types'
import { ComponentMetadataResolver } from './componentMetadataResolver'

/**
 * Pipeline stage that sits between loadout adaptation and port
 * classification (see docs/ImportPipeline.md): fills in factory-component
 * fields the loadout adapter could not supply from the raw export alone
 * — StarBreaker-schema nodes only ever carry `factoryComponent.internalName`
 * (see `loadoutNodeAdapter.ts`) — using the Component Metadata Catalog via
 * `ComponentMetadataResolver`'s exact lookup.
 *
 * This module is deliberately separate from `ComponentMetadataResolver`
 * itself: the resolver is a pure lookup service (load/cache/resolve
 * only), and walking the canonical tree + deciding field precedence is a
 * distinct concern that uses it.
 *
 * Field precedence (highest wins):
 *   1. embedded verified metadata — whatever the raw export already
 *      supplied directly (legacy `factoryComponent`, or an explicit
 *      `size` on the node) is never overwritten.
 *   2. catalog metadata — fills in a field only when the embedded value
 *      is genuinely absent (`undefined`).
 *   3. unresolved — if the catalog has no entry for the mounted entity
 *      class, the node is left exactly as the adapter produced it, and a
 *      warning is recorded. Normalization continues regardless.
 */
export function enrichCanonicalLoadout(
  nodes: CanonicalLoadoutNode[],
  resolver: ComponentMetadataResolver,
  warnings: NormalizationWarning[]
): CanonicalLoadoutNode[] {
  return nodes.map((node) => enrichNode(node, resolver, warnings))
}

function enrichNode(node: CanonicalLoadoutNode, resolver: ComponentMetadataResolver, warnings: NormalizationWarning[]): CanonicalLoadoutNode {
  const children = enrichCanonicalLoadout(node.children, resolver, warnings)

  const internalName = node.factoryComponent?.internalName
  if (!internalName) {
    // No mounted entity identity at all (e.g. an excluded door/seat node
    // with no factoryComponent) — nothing for the catalog to enrich.
    return { ...node, children }
  }

  const resolution = resolver.resolve(internalName)

  if (resolution.status === 'unresolved') {
    warnings.push({
      severity: 'warning',
      code: 'unresolved-component-metadata',
      message: `No Component Metadata Catalog entry for "${internalName}" — factory component metadata left as originally adapted.`,
      path: node.itemPortName,
    })
    return { ...node, children }
  }

  const { metadata } = resolution
  const existing = node.factoryComponent!

  const enrichedFactoryComponent = {
    ...existing,
    // EWO-023 (Task 6) — the catalog's already-resolved, real display name
    // (e.g. "Odyssey", "DayBreak") was never copied here, so every
    // component fell through to factoryLoadoutBuilder.ts's raw-token
    // fallback (generateDisplayName), which just title-cases the internal
    // name verbatim (e.g. "QDRV TARS S02 Odyssey SCItem") — the "internal
    // IDs instead of friendly names" defect. Same embedded-wins-over-catalog
    // precedence as every other field below.
    displayName: existing.displayName ?? metadata.displayName ?? undefined,
    category: existing.category ?? metadata.category ?? undefined,
    subtype: existing.subtype ?? metadata.subtype ?? undefined,
    size: existing.size ?? metadata.size ?? undefined,
    grade: existing.grade ?? (metadata.grade !== null ? String(metadata.grade) : undefined),
    manufacturer: existing.manufacturer ?? metadata.manufacturerRef ?? undefined,
  }

  // node.size (distinct from factoryComponent.size) feeds
  // portConstraintBuilder's existing "bare size -> exact min/max
  // constraint" logic unchanged. This is a numeric fact, not a taxonomy
  // translation, so filling it in from the catalog is safe.
  const enrichedSize = node.size ?? metadata.size ?? undefined

  // TODO(componentMetadataEnrichment): DataCore's `category`/`subtype`
  // (metadata.category / metadata.subtype — e.g. "PowerPlant",
  // "WeaponGun"/"Gun", "Turret"/"GunTurret") is intentionally NOT copied
  // into node.portType here. Some DataCore Type values happen to spell
  // identically to classifyPort()'s existing vocabulary (WeaponGun,
  // PowerPlant, Cooler, Shield, QuantumDrive) but that is not proof the
  // whole taxonomy lines up: DataCore classifies the Gladius's fixed
  // gimbal mount ("Mount_Gimbal_S3") as Type "Turret", which would
  // misroute it into SFM's "Defense" equipment group instead of
  // "Weapons" if copied blindly (confirmed during Mission M-006
  // investigation). A real translation needs an explicit, reviewed
  // DataCore-Type -> SFM-portType mapping table — not built here per
  // Mission M-008's explicit instruction to leave source taxonomy
  // untranslated. Until that table exists, StarBreaker-origin ports
  // continue to fail classifyPort()'s fail-safe "no portType" exclusion,
  // exactly as they did before this integration.

  return {
    ...node,
    size: enrichedSize,
    factoryComponent: enrichedFactoryComponent,
    children,
  }
}
