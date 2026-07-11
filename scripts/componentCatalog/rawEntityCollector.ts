/**
 * Standalone, read-only entity-class collector for raw-data ship exports.
 *
 * Deliberately independent of `src/normalizer` (ShipNormalizer,
 * loadoutNodeAdapter, rawTypes) — Mission M-007 requires the catalog
 * generator not be coupled to normalization behavior. This collector only
 * needs to answer one question: "which exact entity class strings does
 * this document mention?" — not how they should be classified, sized, or
 * displayed.
 */

const ENTITY_CLASS_PREFIX = 'EntityClassDefinition.'

function normalizeClassName(className: string): string {
  return className.startsWith(ENTITY_CLASS_PREFIX) ? className.slice(ENTITY_CLASS_PREFIX.length) : className
}

interface RawLoadoutNodeLike {
  itemPortName?: unknown
  entity?: unknown
  factoryComponent?: { internalName?: unknown } | null
  children?: unknown
}

interface RawShipExportLike {
  entity?: { className?: unknown } | null
  root?: { entity?: unknown } | null
  loadout?: unknown
}

export interface EntityCollectionResult {
  entities: Set<string>
  warnings: string[]
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** Legacy nodes carry the port identifier as `itemPortName`; StarBreaker
 * nodes never do (they use `port` instead) — presence of a non-empty
 * `itemPortName` is what distinguishes the two schemas. */
function isLegacyNodeLike(node: RawLoadoutNodeLike): boolean {
  return isNonEmptyString(node.itemPortName)
}

function resolveShipEntityClass(doc: RawShipExportLike): string | null {
  const legacyClassName = doc.entity && typeof doc.entity === 'object' ? (doc.entity as { className?: unknown }).className : undefined
  if (isNonEmptyString(legacyClassName)) {
    return normalizeClassName(legacyClassName)
  }
  const rootEntity = doc.root && typeof doc.root === 'object' ? (doc.root as { entity?: unknown }).entity : undefined
  if (isNonEmptyString(rootEntity)) {
    return normalizeClassName(rootEntity)
  }
  return null
}

function walkLoadoutNodes(nodes: unknown[], sourceLabel: string, entities: Set<string>, warnings: string[]): void {
  for (const raw of nodes) {
    if (!raw || typeof raw !== 'object') {
      warnings.push(`${sourceLabel}: encountered a non-object loadout node — skipped.`)
      continue
    }
    const node = raw as RawLoadoutNodeLike

    if (isLegacyNodeLike(node)) {
      const internalName =
        node.factoryComponent && typeof node.factoryComponent === 'object' ? (node.factoryComponent as { internalName?: unknown }).internalName : undefined
      if (isNonEmptyString(internalName)) {
        entities.add(normalizeClassName(internalName))
      }
      // A legacy node with no factoryComponent (e.g. an excluded door/seat
      // node) legitimately mounts nothing — not a warning-worthy case.
    } else if (isNonEmptyString(node.entity)) {
      entities.add(normalizeClassName(node.entity))
    } else {
      warnings.push(`${sourceLabel}: loadout node missing both itemPortName and entity — skipped.`)
    }

    const children = Array.isArray(node.children) ? (node.children as unknown[]) : []
    walkLoadoutNodes(children, sourceLabel, entities, warnings)
  }
}

/**
 * Collects every distinct entity class mentioned by a raw ship-export
 * document: the ship's own top-level entity (legacy `entity.className` or
 * `root.entity`), plus every mounted entity found while walking `loadout`
 * (legacy `factoryComponent.internalName`, or StarBreaker `entity`),
 * recursing into `children` for both schemas.
 */
export function collectEntityClasses(doc: unknown, sourceLabel: string): EntityCollectionResult {
  const entities = new Set<string>()
  const warnings: string[] = []

  if (!doc || typeof doc !== 'object') {
    warnings.push(`${sourceLabel}: not a recognizable ship export document — skipped.`)
    return { entities, warnings }
  }
  const shipDoc = doc as RawShipExportLike

  const shipEntityClass = resolveShipEntityClass(shipDoc)
  if (shipEntityClass) {
    entities.add(shipEntityClass)
  } else {
    warnings.push(`${sourceLabel}: no usable ship-level entity (checked entity.className and root.entity).`)
  }

  const loadout = Array.isArray(shipDoc.loadout) ? (shipDoc.loadout as unknown[]) : []
  if (loadout.length === 0) {
    warnings.push(`${sourceLabel}: no loadout array found — no mounted entities collected.`)
  }
  walkLoadoutNodes(loadout, sourceLabel, entities, warnings)

  return { entities, warnings }
}
