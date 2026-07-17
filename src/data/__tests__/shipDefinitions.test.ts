import { describe, it, expect } from 'vitest'
import { shipDefinitions, selectableShipDefinitions, shipDefinitionById, shipFactoryTemplates } from '../shipDefinitions'
import { importedShipList } from '../../generated/importedShips'
import { shipCatalogRecords } from '../../generated/shipCatalog'
import { materializeFleetAsset } from '../../utils/fleetAssetMaterializer'
import { buildPortTree } from '../../utils/portTree'
import { validateTargetCompatibility } from '../componentCatalog'

const gladiusDefinition = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Gladius')

describe('importedFactoryTemplate — Mission M-011 (full nested port tree, not collapsed equipmentAssignments)', () => {
  it('produces one template row per authoritative Port, not one per collapsed equipment assignment', () => {
    if (!gladiusDefinition) return // real generated-data not present on this machine — nothing to assert
    const view = importedShipList.find((v) => v.ship.id === gladiusDefinition.id)!
    const template = shipFactoryTemplates[gladiusDefinition.id]
    expect(template.length).toBe(view.ports.length)
    expect(template.length).toBeGreaterThan(view.equipmentAssignments.length) // strictly more detail than the collapsed view
  })

  it('every template slotLabel is unique — the disambiguation prevents the "Class 2" / "01 Attach Missile" collision', () => {
    if (!gladiusDefinition) return
    const template = shipFactoryTemplates[gladiusDefinition.id]
    const labels = template.map((t) => t.slotLabel)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('preserves the Quantum Drive -> Jump Drive nesting (independent equipment, not collapsed)', () => {
    if (!gladiusDefinition) return
    const template = shipFactoryTemplates[gladiusDefinition.id]
    const quantumDrive = template.find((t) => t.slotLabel === 'Quantum Drive')
    const jumpDrive = template.find((t) => t.slotLabel.endsWith('— Jump Drive'))
    expect(quantumDrive).toBeDefined()
    expect(jumpDrive).toBeDefined()
    expect(jumpDrive!.parentSlotLabel).toBe('Quantum Drive')
  })

  it('a weapon mount is a top-level row and its child gun is nested beneath it', () => {
    if (!gladiusDefinition) return
    const template = shipFactoryTemplates[gladiusDefinition.id]
    // EWO-023 (Task 5): a mount's own slotLabel is now suffixed with its
    // real AssemblyRole ("Gimbal Mount") so the hierarchy visibly
    // distinguishes the mount from its child gun, rather than both
    // reading as plain "Weapon"-shaped labels.
    const noseMount = template.find((t) => t.slotLabel === 'Nose Weapon (Gimbal Mount)')
    expect(noseMount).toBeDefined()
    expect(noseMount!.parentSlotLabel).toBeUndefined()
    const child = template.find((t) => t.parentSlotLabel === 'Nose Weapon (Gimbal Mount)')
    expect(child).toBeDefined()
  })

  it("EWO-023 (Task 5): a terminal (leaf) port never gets a mount-role suffix, even when its own AssemblyRole is GENERIC_MOUNT", () => {
    // Avenger Titan's Power Plant/Cooler ports carry assemblyRole
    // GENERIC_MOUNT too (deriveAssemblyRole's fallback for any entity
    // class that isn't turret/mount-shaped by name) but have no children —
    // they are ordinary equipment, not a structural mount, and must never
    // render as "Power Plant (Mount)".
    const avengerDefinition = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Avenger Titan')
    if (!avengerDefinition) return
    const template = shipFactoryTemplates[avengerDefinition.id]
    const powerPlant = template.find((t) => t.slotLabel === 'Power Plant')
    expect(powerPlant).toBeDefined()
    expect(powerPlant!.slotLabel).not.toContain('Mount')
  })

  it('EWO-023 (Task 5): a structural mount/turret with real children is suffixed with its friendly AssemblyRole label', () => {
    const valkyrieDefinition = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Valkyrie')
    if (!valkyrieDefinition) return
    const template = shipFactoryTemplates[valkyrieDefinition.id]
    const mannedTurret = template.find((t) => t.assemblyRole === 'MANNED_TURRET' && !t.parentSlotLabel)
    expect(mannedTurret).toBeDefined()
    expect(mannedTurret!.slotLabel.toLowerCase()).toContain('manned turret')
    const child = template.find((t) => t.parentSlotLabel === mannedTurret!.slotLabel)
    expect(child).toBeDefined()
  })

  it("EWO-023 (Task 6 follow-on): every deep-imported ship's Factory Loadout is compatibility-valid — no false INCOMPATIBLE flags from equipmentGroup/category vocabulary mismatch", () => {
    // Fixing Task 6's displayName bug made factory item names resolvable
    // against catalogComponentsByName for the first time, which exposed a
    // second, previously-silent bug: FactoryHardpointTemplate.type carried
    // Port.equipmentGroup ("Power", "Weapons" — a plural UI bucket)
    // directly, while validateTargetCompatibility and the catalog it
    // checks against both expect the singular category vocabulary seed
    // ships already use ("Power Plant", "Weapon"). Every ship below must
    // produce zero false-incompatible rows on its own real factory data.
    //
    // "Revenant Gatling" and "MSD-313 Missile Rack" additionally needed a
    // targeted override in src/data/componentCatalog.ts's hand-authored
    // CATALOG table: neither display name is unique across the Mission
    // M-012 bulk catalog (multiple real entity classes at different sizes
    // resolve to the same name), and catalogComponentsByName's "first
    // entry wins" dedup was picking a differently-sized variant than the
    // one actually installed on the real ship that carries it — the same
    // kind of bulk-catalog miscategorization the existing FR-86 override
    // already corrects.
    if (shipCatalogRecords.length === 0) return
    // MWO-001 (Task 4/5) — three real, narrow cases where one display name
    // genuinely corresponds to more than one differently-sized real
    // component in the game, so no single CATALOG entry can validate every
    // ship that carries it correctly (see src/data/componentCatalog.ts's
    // own doc comments): "MSD-543 Missile Rack" (S1 on the 325a, S5
    // everywhere else — CATALOG now favors the S5 majority), bare "Radar"
    // (S1 on the Javelin, S2 on the MOLE — deliberately left out of
    // CATALOG entirely, too generic a name to safely hardcode either way),
    // and "Blizzard" (S3 on Redeemer/Hull C/Starlancer TAC's real Factory
    // cooler, but CATALOG already holds S2 for the seed MOLE fixture's own
    // hand-typed cooler-upgrade target — changing it risks that live,
    // already-certified seed scenario, so the deep-imported ships are the
    // documented exception here instead). Resolving any of these precisely
    // would require identifying components by entity-class id rather than
    // display name — out of this mission's scope ("no redesign").
    const KNOWN_EXCEPTIONS = new Set([
      '325a::MSD-543 Missile Rack', // real S1 unit, vs the real S4 unit CATALOG favors for the Starlancer family (majority)
      'MOLE::Radar', // bare "Radar" left out of CATALOG entirely — too generic/ambiguous a name to safely hardcode (Javelin's own S1 Radar port needs a different size)
      'Redeemer::Blizzard', // real S3 Factory cooler, vs the real S2 CATALOG already holds for the seed MOLE fixture's own hand-typed cooler-upgrade target
      'Hull C::Blizzard',
      'Starlancer TAC::Blizzard',
      'Starlancer TAC Collector Military::Blizzard',
      'Talon::MSD-683 Missile Rack', // real S4 leg-mount hardware, vs the real S7 torpedo rack CATALOG favors for Asgard
      'Talon Shrike::MSD-683 Missile Rack',
      'L21 Wolf::Missile Rack', // real S1 unit, vs the real S2 CATALOG favors for L22 AlphaWolf
      'L21 Wolf Collector Military::Missile Rack',
      'L21 Wolf Collector Stealth::Missile Rack',
      'Perseus::RSI Polaris Torpedo Rack', // real S5 turret racks, vs the real S10 torpedo bay CATALOG favors for the Polaris
      'Starlancer Max::MSD-543 Missile Rack', // real S4 unit, an additional size beyond the S1 (325a) / S5 (majority) split above
      'Starlancer TAC::MSD-543 Missile Rack',
      'Starlancer TAC Collector Military::MSD-543 Missile Rack',
    ])
    for (const view of importedShipList) {
      const definition = shipDefinitions.find((d) => d.id === view.ship.id)!
      const template = shipFactoryTemplates[definition.id]
      for (const row of template) {
        if (row.isStructural || row.factoryItem === '—') continue
        if (KNOWN_EXCEPTIONS.has(`${view.ship.name}::${row.factoryItem}`)) continue
        const result = validateTargetCompatibility(row.factoryItem, row.type, row.size)
        expect(result.valid, `${view.ship.name} — ${row.slotLabel}: ${result.message ?? ''}`).toBe(true)
      }
    }
  })
})

describe('materializeFleetAsset + buildPortTree — end-to-end for an imported ship (Mission M-011)', () => {
  it('a Fleet Asset materialized from an imported ShipDefinition keeps its full nested port tree', () => {
    if (!gladiusDefinition) return
    const definition = shipDefinitionById.get(gladiusDefinition.id)!
    const template = shipFactoryTemplates[gladiusDefinition.id]
    const { hardpoints } = materializeFleetAsset({ definition, template, ownershipType: 'OWNED', priority: 1 })

    const tree = buildPortTree(hardpoints)
    const quantumDrive = tree.find((n) => n.hardpoint.slotLabel === 'Quantum Drive')
    expect(quantumDrive).toBeDefined()
    expect(quantumDrive!.children.some((c) => c.hardpoint.slotLabel.endsWith('— Jump Drive'))).toBe(true)

    // Every hardpoint id remains the row's own unique id (stable, from
    // materializeFleetAsset's own scheme) — no duplicates introduced by
    // the disambiguated labels.
    expect(new Set(hardpoints.map((h) => h.id)).size).toBe(hardpoints.length)
  })
})

describe('Mission M-012: shipDefinitions includes the authoritative ship/vehicle catalog (Add Ship roster breadth)', () => {
  it('12. Add Ship\'s roster includes catalog-derived ships beyond the seed fleet + deep-imported ships (MWO-001: most of the former catalog-only roster is now deep-imported, leaving only variant/livery SKUs whose base hull was promoted)', () => {
    if (shipCatalogRecords.length === 0) return // real generated-data/ship-catalog.json not present on this machine
    const catalogSourced = shipDefinitions.filter((d) => d.sourceMetadata.sourceType === 'StarBreaker' && (d as unknown as { sourceMetadata: { sourceFile?: string } }).sourceMetadata.sourceFile === 'ship-catalog')
    expect(catalogSourced.length).toBeGreaterThan(0)
  })

  it('12. a real catalog-only variant SKU (RSI Apollo Medivac Tier 1 — its base hull was promoted, this livery tier was not) is searchable by displayName and manufacturer, same shape as seed/imported ships', () => {
    if (shipCatalogRecords.length === 0) return
    const medivac = shipDefinitions.find((d) => d.id === 'RSI_Apollo_Medivac_Tier_1')
    expect(medivac).toBeDefined()
    expect(medivac!.displayName).toBe('RSI Apollo Medivac')
    expect(medivac!.manufacturer).toBe('Roberts Space Industries')
  })

  it('does not duplicate the two deep-imported ships (Gladius, Avenger Titan) between the imported and catalog sources', () => {
    if (shipCatalogRecords.length === 0) return
    // Exactly one entry for the base Gladius/Avenger Titan — the
    // deep-imported one — not a second catalog-only duplicate. (Real,
    // distinct variants like "Gladius Valiant" are expected to appear
    // separately and are not a duplicate of the base ship.)
    expect(shipDefinitions.filter((d) => d.displayName === 'Gladius').length).toBe(1)
    expect(shipDefinitions.filter((d) => d.displayName === 'Avenger Titan').length).toBe(1)
    expect(shipDefinitions.some((d) => d.displayName === 'Aegis Gladius')).toBe(false)
    expect(shipDefinitions.some((d) => d.displayName === 'Aegis Avenger Titan')).toBe(false)
  })

  it('a catalog-only ship (no deep import) materializes with an empty, honest factory template rather than crashing or inventing ports', () => {
    if (shipCatalogRecords.length === 0) return
    const hornet = shipDefinitions.find((d) => d.id === 'ANVL_Hornet_F7A_Mk2')
    if (!hornet) return
    expect(shipFactoryTemplates[hornet.id]).toEqual([])
  })
})

describe('EWO-019: deep-imported ships supersede their catalog-only entry with no duplicate Add Ship listing', () => {
  it('every deep-imported ship appears in shipDefinitions exactly once under its generated id, and never a second time under its canonical entity class', () => {
    for (const v of importedShipList) {
      expect(shipDefinitions.filter((d) => d.id === v.ship.id).length).toBe(1)
      const canonicalId = v.ship.sourceEntityClass
      if (canonicalId) {
        expect(shipDefinitions.some((d) => d.id === canonicalId)).toBe(false)
      }
    }
  })

  it('a deep-imported ship materializes with a non-empty factory template (not the catalog-only empty fallback)', () => {
    for (const v of importedShipList) {
      const template = shipFactoryTemplates[v.ship.id]
      expect(template.length).toBeGreaterThan(0)
    }
  })
})

describe('EWO-019: canonical entity class resolves to the same rich definition as the generated import id (Task 7/8 identity alias)', () => {
  it('shipDefinitionById resolves a deep-imported ship both by its generated id and by its canonical entity class, to the identical object', () => {
    for (const v of importedShipList) {
      const canonicalId = v.ship.sourceEntityClass
      if (!canonicalId) continue
      const byGeneratedId = shipDefinitionById.get(v.ship.id)
      const byCanonicalId = shipDefinitionById.get(canonicalId)
      expect(byGeneratedId).toBeDefined()
      expect(byCanonicalId).toBe(byGeneratedId) // same object reference, not just equal shape
    }
  })

  it('shipFactoryTemplates also resolves a deep-imported ship by its canonical entity class, non-empty — this is what lets a FleetAsset persisted before deep-import existed (shipDefinitionId = canonical class) self-heal on next load instead of staying stuck on an empty template', () => {
    for (const v of importedShipList) {
      const canonicalId = v.ship.sourceEntityClass
      if (!canonicalId) continue
      expect(shipFactoryTemplates[canonicalId]).toEqual(shipFactoryTemplates[v.ship.id])
      expect(shipFactoryTemplates[canonicalId].length).toBeGreaterThan(0)
    }
  })

  it('the canonical-class alias is never listed a second time in the Add Ship roster (shipDefinitions stays de-duplicated)', () => {
    for (const v of importedShipList) {
      const canonicalId = v.ship.sourceEntityClass
      if (!canonicalId) continue
      expect(shipDefinitions.some((d) => d.id === canonicalId)).toBe(false)
    }
  })
})

describe('EWO-021: Canonical Ship Definition Consolidation', () => {
  it('Task 1/7 — no two selectable definitions describe the same real hull (no duplicate names in the Add Ship picker)', () => {
    // Manufacturer-prefix-aware: a Mission M-012 catalog entry's own
    // displayName bakes the manufacturer in ("Drake Cutlass Red"); a
    // seed/deep-imported definition's name never does. Comparing bare
    // (post-strip) names is what actually reflects what a Commander sees
    // as "the same ship", exactly like the picker's own de-duplication.
    function bare(d: (typeof selectableShipDefinitions)[number]): string {
      if (d.sourceMetadata.sourceType === 'StarBreaker' && (d.sourceMetadata as { sourceFile?: string }).sourceFile === 'ship-catalog') {
        const firstWord = d.displayName.split(' ')[0]
        if (firstWord && d.manufacturer.toLowerCase().startsWith(firstWord.toLowerCase())) {
          return d.displayName.slice(firstWord.length).trim().toLowerCase()
        }
      }
      return d.displayName.toLowerCase()
    }
    const seen = new Map<string, string>()
    const duplicates: string[] = []
    for (const d of selectableShipDefinitions) {
      const key = bare(d)
      if (seen.has(key)) duplicates.push(`"${key}": ${seen.get(key)} vs ${d.id}`)
      else seen.set(key, d.id)
    }
    expect(duplicates).toEqual([])
  })

  it('Task 2 — Cutlass Black resolves to the deep-imported (richest) definition in the picker, not the seed demo entry', () => {
    if (shipCatalogRecords.length === 0) return // real generated-data not present on this machine
    const cutlassBlackEntries = selectableShipDefinitions.filter((d) => d.displayName === 'Cutlass Black')
    expect(cutlassBlackEntries).toHaveLength(1)
    expect(cutlassBlackEntries[0].sourceMetadata.sourceType).toBe('StarBreaker')
    expect(cutlassBlackEntries[0].id).toBe('cutlass-black-imported')
  })

  it('Task 2 — Corsair resolves to the deep-imported definition in the picker, not the seed demo entry', () => {
    if (shipCatalogRecords.length === 0) return
    const corsairEntries = selectableShipDefinitions.filter((d) => d.displayName === 'Corsair')
    expect(corsairEntries).toHaveLength(1)
    expect(corsairEntries[0].id).toBe('corsair-imported')
  })

  it('MWO-001 (Task 2) — Cutlass Red resolves to exactly one selectable entry: the real deep-imported definition, now that Golden Fleet promotion supersedes both the seed fixture and the empty Mission M-012 catalog placeholder', () => {
    if (shipCatalogRecords.length === 0) return
    const cutlassRedEntries = selectableShipDefinitions.filter((d) => d.displayName === 'Cutlass Red')
    expect(cutlassRedEntries).toHaveLength(1)
    expect(cutlassRedEntries[0].sourceMetadata.sourceType).toBe('StarBreaker')
    expect(cutlassRedEntries[0].sourceMetadata.sourceFile).toBeUndefined()
    // Neither the seed id nor the catalog placeholder id appears as its own
    // separate selectable entry — both alias to the one real definition.
    expect(selectableShipDefinitions.some((d) => d.id === 'cutlass-red')).toBe(false)
    expect(selectableShipDefinitions.some((d) => d.id === 'DRAK_Cutlass_Red')).toBe(false)
    expect(shipDefinitionById.get('cutlass-red')).toBe(cutlassRedEntries[0])
    expect(shipDefinitionById.get('DRAK_Cutlass_Red')).toBe(cutlassRedEntries[0])
  })

  it('MWO-001 (Task 2) — the same pattern holds for every other seed ship whose real hull is now Golden-Fleet deep-imported (Ghost, MOLE, Railen, 135c, M80, Starlite, UTV, Vulture, Prospector)', () => {
    if (shipCatalogRecords.length === 0) return
    // CWO-005 (Task 1): every deep-imported ship's displayName now
    // resolves through the universe catalog's own official RSI/CIG name
    // (canonicalDeepImportDisplayName in shipDefinitions.ts), not the raw
    // entity-class-derived name — Ghost and M80 both changed as a result
    // ("Hornet F7CS Mk2" -> "F7C-S Hornet Ghost Mk II", "m80" -> "M80");
    // the other 7 already matched the catalog's official name exactly.
    const seedIdToImportedDisplayName: Record<string, string> = {
      ghost: 'F7C-S Hornet Ghost Mk II',
      mole: 'MOLE',
      railen: 'Railen',
      '135c': '135c',
      m80: 'M80',
      starlite: 'Starlite',
      utv: 'UTV',
      vulture: 'Vulture',
      prospector: 'Prospector',
    }
    for (const [seedId, importedDisplayName] of Object.entries(seedIdToImportedDisplayName)) {
      const matches = selectableShipDefinitions.filter((d) => d.displayName === importedDisplayName)
      expect(matches, `expected exactly one selectable "${importedDisplayName}"`).toHaveLength(1)
      expect(matches[0].sourceMetadata.sourceType, `${seedId} -> ${importedDisplayName}`).toBe('StarBreaker')
      // The old seed id keeps resolving — to the new canonical definition,
      // not its own now-superseded one — so no existing FleetAsset is orphaned.
      expect(shipDefinitionById.get(seedId)).toBe(matches[0])
    }
  })

  it('Task 5 — a FleetAsset referencing a delisted catalog-only placeholder id self-heals to the canonical (seed) definition\'s real data', () => {
    if (shipCatalogRecords.length === 0) return
    const canonical = shipDefinitionById.get('cutlass-red')
    const superseded = shipDefinitionById.get('DRAK_Cutlass_Red')
    expect(canonical).toBeDefined()
    expect(superseded).toBe(canonical) // same object reference — real self-healing, not a coincidental equal shape
    expect(shipFactoryTemplates['DRAK_Cutlass_Red']).toEqual(shipFactoryTemplates['cutlass-red'])
    expect(shipFactoryTemplates['DRAK_Cutlass_Red'].length).toBeGreaterThan(0)
  })

  it('MWO-001 (Task 2) — a seed definition superseded by a deep-import IS now aliased to it, safely, thanks to EWO-043 reconciliation', () => {
    if (shipCatalogRecords.length === 0) return
    const seedCutlassBlack = shipDefinitionById.get('cutlass-black')
    const seedCorsair = shipDefinitionById.get('corsair')
    const importedCutlassBlack = shipDefinitionById.get('DRAK_Cutlass_Black')
    const importedCorsair = shipDefinitionById.get('DRAK_Corsair')
    // Both ids now resolve to their real deep-imported definition — an
    // existing seed-migrated FleetAsset on either id materializes with
    // the authoritative port tree on its next rehydration, and any
    // Commander customization it carried is preserved/reconciled by
    // src/utils/fleetAssetReconciliation.ts, not silently discarded.
    // This was deliberately NOT the case before EWO-043 (see
    // docs/ADR/ADR-008-Canonical-Ship-Definition.md for the original,
    // now-superseded rationale) — reconciliation is what makes it safe.
    expect(seedCutlassBlack?.sourceMetadata.sourceType).toBe('StarBreaker')
    expect(seedCorsair?.sourceMetadata.sourceType).toBe('StarBreaker')
    expect(seedCutlassBlack).toBe(importedCutlassBlack)
    expect(seedCorsair).toBe(importedCorsair)
  })

  it('Task 6 — searching "Cutlass Black" or "Cutlass Red" against the selectable roster returns exactly one match each (a bare "Red" substring also matching an unrelated ship, e.g. "Aegis Redeemer", is correct and expected — this checks the reported duplicate specifically, not global substring uniqueness)', () => {
    if (shipCatalogRecords.length === 0) return
    const search = (q: string) => selectableShipDefinitions.filter((d) => d.displayName.toLowerCase().includes(q.toLowerCase()))
    expect(search('Cutlass Black')).toHaveLength(1)
    expect(search('Cutlass Red')).toHaveLength(1)
  })

  it('every definition in the full registry (canonical or superseded) remains resolvable by id — no FleetAsset can be orphaned', () => {
    for (const d of shipDefinitions) {
      expect(shipDefinitionById.get(d.id)).toBeDefined()
    }
  })
})
