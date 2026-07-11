import type { Normalizer } from './interfaces'
import type { RawRecord } from '../engine/importer/interfaces'
import type { RawShipExport, RawEntity } from './rawTypes'
import type { CanonicalLoadoutNode } from './loadoutNodeAdapter'
import type {
  NormalizedShipPackage,
  Ship,
  Port,
  FactoryLoadout,
  InstalledLoadout,
  TargetBuild,
  NormalizationWarning,
  EquipmentGroup,
} from '../engine/types'
import { emptyClassification } from '../engine/types'
import { classifyPort } from './portClassifier'
import { buildPortConstraints } from './portConstraintBuilder'
import { buildFactoryLoadout } from './factoryLoadoutBuilder'
import { resolveEquipmentAssignments } from './equipmentResolver'
import { adaptLoadoutNodes } from './loadoutNodeAdapter'

const IMPORTER_VERSION = '1.0.0'

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const ENTITY_CLASS_PREFIX = 'EntityClassDefinition.'

/** Strips the "EntityClassDefinition." prefix StarBreaker exports use for
 * fully-qualified entity class names, so stable IDs derived from the class
 * name don't shift depending on which export envelope produced them. */
function normalizeClassName(className: string): string {
  return className.startsWith(ENTITY_CLASS_PREFIX) ? className.slice(ENTITY_CLASS_PREFIX.length) : className
}

/**
 * Resolves the source entity across both supported export envelopes:
 * the legacy top-level `entity` metadata object, and the newer
 * `root.entity` envelope (which only carries the class name as a string,
 * not the full metadata object). Returns `undefined` when neither is present.
 */
export function resolveShipEntity(doc: RawShipExport | undefined | null): RawEntity | undefined {
  if (!doc) return undefined
  if (doc.entity) {
    return {
      ...doc.entity,
      className: doc.entity.className ? normalizeClassName(doc.entity.className) : doc.entity.className,
    }
  }
  if (doc.root?.entity) {
    return { className: normalizeClassName(doc.root.entity) }
  }
  return undefined
}

/** "AEGS_Gladius" -> "Gladius". Strips a leading all-caps manufacturer
 * code token when one is present; otherwise returns the class name
 * title-cased, unchanged in structure. Never invents a name that isn't
 * derivable from the source. */
function deriveShipName(className: string | undefined, model: string | undefined): string {
  if (model) return model
  if (!className) return 'Unknown Ship'
  const tokens = className.split(/[_\s]+/).filter(Boolean)
  if (tokens.length > 1 && /^[A-Z0-9]{2,6}$/.test(tokens[0])) {
    return tokens.slice(1).join(' ')
  }
  return tokens.join(' ')
}

interface PortWithFactory {
  portId: string
  internalName: string
  factoryComponent: CanonicalLoadoutNode['factoryComponent']
}

/**
 * `ShipNormalizer` — the generalized replacement for the Gladius
 * proof-of-concept's ship-specific normalizer. Nothing in this class
 * mentions any particular ship; every shape decision (which ports are
 * relevant, what they're named, what's installed) comes from the raw
 * document and the shared classifier/constraint/loadout builders.
 */
export class ShipNormalizer implements Normalizer {
  constructor(private overrideMap?: Record<string, string>) {}

  normalize(raw: RawRecord, sourceFile: string): NormalizedShipPackage {
    const doc = raw as RawShipExport
    const entity = resolveShipEntity(doc)
    if (!doc || !entity || !Array.isArray(doc.loadout)) {
      throw new Error(`ShipNormalizer: "${sourceFile}" is missing entity/loadout — not a recognizable StarBreaker export.`)
    }

    const shipId = `${slugify(deriveShipName(entity.className, entity.model))}-imported`
    const factoryLoadoutId = `${shipId}-factory-loadout`

    const ports: Port[] = []
    const portById = new Map<string, Port>()
    const relevantForFactory: PortWithFactory[] = []
    const normalizationWarnings: NormalizationWarning[] = []
    let excludedCount = 0

    const canonicalLoadout = adaptLoadoutNodes(doc.loadout, '', normalizationWarnings)

    const walk = (node: CanonicalLoadoutNode, nearestIncludedParentId: string | null, sourcePathPrefix: string) => {
      const classification = classifyPort(node.itemPortName, node.portType, this.overrideMap)
      let thisPortId: string | null = null

      if (classification.include && classification.equipmentGroup) {
        thisPortId = `${shipId}-port-${node.itemPortName}`
        const { constraints, warnings } = buildPortConstraints(node)
        normalizationWarnings.push(...warnings)

        const port: Port = {
          id: thisPortId,
          shipId,
          parentPortId: nearestIncludedParentId,
          equipmentGroup: classification.equipmentGroup,
          internalName: node.itemPortName,
          displayName: classification.displayName,
          positionLabel: classification.positionLabel,
          allowedTypes: constraints.allowedTypes,
          allowedSubtypes: constraints.allowedSubtypes,
          minSize: constraints.minSize,
          maxSize: constraints.maxSize,
          installedItemId: undefined,
          factoryItemId: undefined,
          targetItemId: undefined,
          childPortIds: [],
          sourcePath: `${sourcePathPrefix}/${node.itemPortName}`,
        }
        ports.push(port)
        portById.set(thisPortId, port)
        relevantForFactory.push({ portId: thisPortId, internalName: node.itemPortName, factoryComponent: node.factoryComponent })

        if (nearestIncludedParentId) {
          portById.get(nearestIncludedParentId)?.childPortIds?.push(thisPortId)
        }
      } else {
        excludedCount++
        normalizationWarnings.push({
          severity: 'warning',
          code: 'excluded-node',
          message: classification.reason,
          path: node.itemPortName,
        })
      }

      const childParentId = thisPortId ?? nearestIncludedParentId
      for (const child of node.children ?? []) {
        walk(child, childParentId, `${sourcePathPrefix}/${node.itemPortName}`)
      }
    }

    for (const node of canonicalLoadout) {
      walk(node, null, '')
    }

    const factoryResult = buildFactoryLoadout(shipId, relevantForFactory, this.overrideMap)
    normalizationWarnings.push(...factoryResult.warnings)

    const factoryByPort = new Map(factoryResult.assignments.map((a) => [a.portId, a.componentId]))
    for (const port of ports) {
      const itemId = factoryByPort.get(port.id) ?? null
      port.factoryItemId = itemId
      port.installedItemId = itemId // Installed = Factory on first import
      port.targetItemId = itemId // Default Target Build = Factory
    }

    const factoryLoadout: FactoryLoadout = {
      id: factoryLoadoutId,
      shipId,
      portAssignments: factoryResult.assignments,
    }

    const installedLoadout: InstalledLoadout = {
      id: `${shipId}-installed-loadout`,
      shipId,
      portAssignments: factoryResult.assignments.map((a) => ({ portId: a.portId, componentId: a.componentId })),
      updatedAt: 'On import',
    }

    const defaultTargetBuild: TargetBuild = {
      id: `${shipId}-target-default`,
      shipId,
      name: 'Factory Build',
      role: entity.role,
      isActive: true,
      portAssignments: factoryResult.assignments.map((a) => ({ portId: a.portId, componentId: a.componentId })),
    }

    const equipmentGroups = Array.from(new Set(ports.map((p) => p.equipmentGroup))) as EquipmentGroup[]

    const { assignments: equipmentAssignments, warnings: resolutionWarnings } = resolveEquipmentAssignments(shipId, ports)
    normalizationWarnings.push(...resolutionWarnings)

    const ship: Ship = {
      id: shipId,
      manufacturer: entity.manufacturer ?? '',
      name: deriveShipName(entity.className, entity.model),
      career: entity.career ?? '',
      role: entity.role ?? '',
      insurance: entity.insurance,
      ownership: 'Owned',
      factoryLoadoutId,
      model: entity.model,
      classification: emptyClassification(),
    }

    normalizationWarnings.push({
      severity: 'warning',
      code: 'excluded-node-summary',
      message: `${excludedCount} raw loadout node(s) excluded as non-user-manageable (doors, seats, controllers, geometry, etc.).`,
    })

    return {
      ship,
      equipmentGroups,
      ports,
      components: factoryResult.components,
      equipmentAssignments,
      factoryLoadout,
      installedLoadout,
      defaultTargetBuild,
      compatibilityWarnings: [],
      normalizationWarnings,
      sourceMetadata: {
        sourceType: 'StarBreaker',
        sourceEntity: entity.className ?? 'unknown',
        sourceFile,
        importedAt: new Date().toISOString(),
        importerVersion: IMPORTER_VERSION,
      },
    }
  }
}
