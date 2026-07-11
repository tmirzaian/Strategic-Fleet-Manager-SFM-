import type { CanonicalLoadoutNode } from './loadoutNodeAdapter'
import type { NormalizationWarning } from '../engine/types'
import { ComponentMetadataResolver } from './componentMetadataResolver'
import { translateClassification } from './classificationTranslator'

/**
 * Pipeline stage that sits between `componentMetadataEnrichment` and
 * `classifyPort()` (see docs/ImportPipeline.md): sets `node.portType`
 * from `classificationTranslator`'s explicit result when the adapter
 * could not supply one — a StarBreaker-schema node never has a
 * `portType` at all (see `loadoutNodeAdapter.ts`), so real StarBreaker
 * fixtures would otherwise fail `classifyPort()`'s fail-safe "no
 * portType" exclusion unconditionally.
 *
 * This module owns none of the DataCore-to-SFM interpretation itself
 * (that's `classificationTranslator.ts`'s job) — it only walks the tree,
 * gathers the one piece of structural context the translator needs (its
 * direct children's own resolved DataCore categories, for the
 * Mount_Gimbal_S3 disambiguation), applies field precedence, and turns
 * the translator's result into normalization warnings.
 *
 * Field precedence (highest wins):
 *   1. An existing, legacy-verified `node.portType` is never overwritten.
 *   2. An explicit `translated` result fills a missing `portType`.
 *   3. An `excluded` result leaves `portType` unset and records a
 *      distinct warning (this is a deliberate exclusion, not a data gap).
 *   4. An `unresolved` result leaves `portType` unset and records a
 *      different warning (this IS a data gap, not a decision).
 */
export function enrichClassification(
  nodes: CanonicalLoadoutNode[],
  resolver: ComponentMetadataResolver,
  warnings: NormalizationWarning[]
): CanonicalLoadoutNode[] {
  return nodes.map((node) => enrichNodeClassification(node, resolver, warnings))
}

/** The DataCore `category` of one node, via the same exact-key resolver
 * used everywhere else — independent of whether that node's own
 * classification succeeded, excluded, or stayed unresolved. */
function resolvedCategoryOf(node: CanonicalLoadoutNode, resolver: ComponentMetadataResolver): string | null {
  const internalName = node.factoryComponent?.internalName
  if (!internalName) return null
  const resolution = resolver.resolve(internalName)
  return resolution.status === 'resolved' ? resolution.metadata.category : null
}

function enrichNodeClassification(node: CanonicalLoadoutNode, resolver: ComponentMetadataResolver, warnings: NormalizationWarning[]): CanonicalLoadoutNode {
  const children = enrichClassification(node.children, resolver, warnings)

  const internalName = node.factoryComponent?.internalName
  if (!internalName) {
    return { ...node, children }
  }

  const resolution = resolver.resolve(internalName)
  if (resolution.status === 'unresolved') {
    // No catalog metadata at all for this entity — componentMetadataEnrichment
    // already warned about that gap; nothing more for the translator to do.
    return { ...node, children }
  }

  const childCategories = children.map((child) => resolvedCategoryOf(child, resolver))
  const translation = translateClassification(resolution.metadata, { childCategories })

  if (translation.status === 'excluded') {
    warnings.push({
      severity: 'warning',
      code: 'classification-excluded',
      message: `"${internalName}" (${translation.sourceCategory}/${translation.sourceSubtype ?? 'UNDEFINED'}) is a deliberately excluded internal attachment, not player-configurable equipment: ${translation.reason}`,
      path: node.itemPortName,
    })
    return { ...node, children }
  }

  if (translation.status === 'unresolved') {
    warnings.push({
      severity: 'warning',
      code: 'classification-unresolved',
      message: `No classification translation for "${internalName}": ${translation.reason}`,
      path: node.itemPortName,
    })
    return { ...node, children }
  }

  if (node.portType) {
    // Existing, legacy-verified portType — never overwritten by a translation.
    return { ...node, children }
  }

  return { ...node, portType: translation.canonicalPortType, children }
}
