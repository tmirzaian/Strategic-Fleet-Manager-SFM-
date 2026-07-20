import { describe, it, expect } from 'vitest'
import { shipDefinitions, selectableShipDefinitions, shipDefinitionById, shipFactoryTemplates } from '../shipDefinitions'
import { importedShipList } from '../../generated/importedShips'
import { shipCatalogRecords } from '../../generated/shipCatalog'
import { materializeFleetAsset } from '../../utils/fleetAssetMaterializer'
import { buildPortTree } from '../../utils/portTree'
import { validateTargetCompatibility, isPlayerSelectableRecord } from '../componentCatalog'
import { compatibilityPortTypeFor, resolveComponentByEntityClass } from '../../generated/componentCatalog'

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
      // RC-001A originally found "M2C \"Swarm\"" shared by three real,
      // differently-shaped components (BEHR_LaserRepeater_PDC_S1, a real
      // S1 WeaponGun; Turret_PDC_BEHR_A and Turret_PDC_VNCL, both a real
      // S2 PDCTurret) — the SAME literal name used for both the PDC
      // turret's structural shell and its internal gun on every affected
      // ship. CAT-003/EWO-STAB-004A resolved this: `validateTargetCompatibility`
      // now prefers each row's own already-resolved `factoryEntityClass`
      // (see the call above) rather than re-deriving everything from
      // "M2C \"Swarm\""'s ambiguous display-name text, and a dedicated
      // PDC_TURRET destination-capability rule (ADR-010) lets the S2
      // turret assembly validate against its own native port. No longer
      // an exception on any of the 11 ships this pattern appears on
      // (Idris M/P, Reclaimer, 890Jump, Constellation Phoenix, Perseus,
      // Polaris, Mauler) — removed from this list.
      // RC-001A: a second, unrelated class of finding surfaced by the same
      // re-run — a handful of components' DataCore localization key
      // genuinely never resolves (the raw "<= PLACEHOLDER =>" sentinel
      // leaks through as the literal factoryItem name instead), so
      // compatibility validation correctly rejects a string that was
      // never a real component name to begin with. A genuine, permanent
      // data gap (not caused by RC-001A), out of its Basher-only scope —
      // flagged as its own follow-up candidate (componentMetadataEnrichment
      // should likely fall back to "Unknown Factory Item" instead of
      // leaking this sentinel through).
      'Javelin::<= PLACEHOLDER =>',
      'Cutlass Steel::<= PLACEHOLDER =>',
      'ROC DS::<= PLACEHOLDER =>',
      'Starlancer TAC::<= PLACEHOLDER =>',
      'Starlancer TAC Collector Military::<= PLACEHOLDER =>',
      // RC-001A originally found a third class here, same root cause as
      // the M2C "Swarm" case: bare, generic factory-item names ("Turret",
      // "Tractor Beam") shared across dozens of real, differently-sized/
      // categorized components fleet-wide — confirmed real and
      // Commander-visible (these ships' own stock factory hardpoints
      // showed "Invalid Target" out of the box), flagged as a candidate
      // for "a dedicated fleet-wide bare-name disambiguation mission."
      //
      // VRF-002 is that mission, for the "Turret" half of the finding:
      // root cause was DataCore category "Turret" (the turret-shell
      // hardware itself — Grin_MXC_Turret, the VariPuck gimbal family,
      // ANVL_Fixed_Mount_Hornet_Ball_S4, and every real ship/vehicle
      // sharing this hardware family) having no entry at all in
      // CATEGORY_TO_PORT_TYPE (src/generated/componentCatalog.ts) — so
      // every one of these candidates was invisible to
      // isPlayerSelectableRecord regardless of entityClass being supplied,
      // never actually validated (only ever permissively unresolved,
      // which happened to read as "OK" until name-only resolution ever
      // kicked in instead — see the Greycat MTC's own field report). Fixed
      // by adding `Turret: 'Gimbal Mount'` there, plus a narrow
      // factory-component-category fallback in compatibilityTypeFor
      // (src/data/shipDefinitions.ts) for the handful of ports whose own
      // assemblyRole is GENERIC_MOUNT rather than a turret-specific role.
      // All 13 "::Turret" entries below now validate for real — removed
      // from this list rather than left stale, so this exact test proves
      // the fix across every ship it names, not just the one reported.
      // "::Tractor Beam" is a separate real category (ToolArm) this
      // mission did not investigate — left as-is, still a real, open gap.
      'Caterpillar::Tractor Beam',
      'Caterpillar Pirate::Tractor Beam',
      'Command Module::Tractor Beam',
      'Ironclad::Tractor Beam',
      'Ironclad Assault::Tractor Beam',
    ])
    for (const view of importedShipList) {
      const definition = shipDefinitions.find((d) => d.id === view.ship.id)!
      const template = shipFactoryTemplates[definition.id]
      for (const row of template) {
        if (row.isStructural || row.factoryItem === '—') continue
        if (KNOWN_EXCEPTIONS.has(`${view.ship.name}::${row.factoryItem}`)) continue
        // EWO-STAB-004A — prefers the template's own already-resolved
        // factoryEntityClass (see FactoryHardpointTemplate's doc comment)
        // over re-deriving everything from factoryItem's display-name
        // text, exactly like every real compatibility caller now does.
        // Several real display names (e.g. "M9A Cannon", "M2C \"Swarm\"")
        // are genuinely ambiguous by name alone across different real,
        // differently-sized/shaped entityClasses — this is the identity
        // that resolves each row to the one actually installed there.
        const result = validateTargetCompatibility(row.factoryItem, row.type, row.size, {
          itemEntityClass: row.factoryEntityClass,
          destinationFactoryEntityClass: row.factoryEntityClass,
        })
        expect(result.valid, `${view.ship.name} — ${row.slotLabel}: ${result.message ?? ''}`).toBe(true)
      }
    }
  })
})

describe('VRF-002: Turret-category turret/gimbal-shell hardware is genuinely resolved, not permissively unresolved', () => {
  // Root cause: DataCore category "Turret" (the manned/remote turret
  // SHELL hardware itself — Grin_MXC_Turret on the Greycat MTC, the
  // VariPuck gimbal family, ANVL_Fixed_Mount_Hornet_Ball_S4, and every
  // real turret shell on Ballista/Centurion/Spirit/890 Jump/Ursa/Lynx/Nova)
  // had NO entry in CATEGORY_TO_PORT_TYPE. isPlayerSelectableRecord/
  // compatibilityPortTypeFor treated every one of these as entirely
  // unresolved — not rejected, but invisible — so a factory loadout using
  // one only ever "passed" via validateTargetCompatibility's permissive
  // "can't disprove an unresolved item" fallback, never via a real,
  // positively-verified type/size match. The fleet-wide sweep above
  // (which always threads factoryEntityClass through) can't tell
  // "genuinely verified" apart from "permissively unresolved" by its
  // pass/fail boolean alone — both read `valid: true` — so these tests
  // check the actual resolution mechanism directly instead.
  it('a real Turret-category component (MTC\'s own Grin_MXC_Turret) is now player-selectable — previously invisible to isPlayerSelectableRecord regardless of entityClass', () => {
    const resolution = resolveComponentByEntityClass('Grin_MXC_Turret')
    if (resolution.status !== 'resolved') return
    expect(resolution.record.category).toBe('Turret')
    expect(isPlayerSelectableRecord(resolution.record)).toBe(true)
  })

  it('compatibilityPortTypeFor resolves every real Turret subtype (BallTurret, GunTurret, MissileTurret, NoseMounted, TopTurret) to "Gimbal Mount", not undefined', () => {
    for (const subtype of ['BallTurret', 'GunTurret', 'MissileTurret', 'NoseMounted', 'TopTurret']) {
      expect(compatibilityPortTypeFor('Turret', subtype), `subtype ${subtype}`).toBe('Gimbal Mount')
    }
  })

  it('a PDCTurret-subtype record is unaffected — still evaluated only by its own dedicated PDC rule, never the ordinary Turret->Gimbal Mount path', () => {
    // compatibilityPortTypeFor itself now translates PDCTurret's raw
    // category too (harmless — checkCompatibility's `subtype ===
    // 'PDCTurret'` branch runs first and never reads this translated
    // value), so this only re-confirms the PDC-specific test suite
    // (src/data/__tests__/pdcCompatibility.test.ts) stays green — see
    // that file for the actual exclusivity proof.
    expect(compatibilityPortTypeFor('Turret', 'PDCTurret')).toBe('Gimbal Mount')
  })

  it('the Hornet F7CM Heartseeker\'s fixed Center Weapon mount (assemblyRole GENERIC_MOUNT, not a turret-specific role) resolves its own port type to "Gimbal Mount" via the factory component\'s real category, not the raw "Defense" equipmentGroup string', () => {
    const def = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'F7C-M Hornet Heartseeker Mk I')
    if (!def) return
    const template = shipFactoryTemplates[def.id]
    const centerWeapon = template.find((t) => t.slotLabel.includes('Center Weapon') && !t.parentSlotLabel)
    expect(centerWeapon).toBeDefined()
    expect(centerWeapon!.type).toBe('Gimbal Mount')
    expect(centerWeapon!.type).not.toBe('Defense')
    const result = validateTargetCompatibility(centerWeapon!.factoryItem, centerWeapon!.type, centerWeapon!.size, {
      itemEntityClass: centerWeapon!.factoryEntityClass,
      destinationFactoryEntityClass: centerWeapon!.factoryEntityClass,
    })
    expect(result.valid, result.message).toBe(true)
  })

  it('the Hornet F7C Wildfire\'s equivalent fixed mount (equipmentGroup "Weapons" this time, same GENERIC_MOUNT/Turret-category shape) resolves the same way', () => {
    const def = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'F7C Hornet Wildfire Mk I')
    if (!def) return
    const template = shipFactoryTemplates[def.id]
    const centerWeapon = template.find((t) => t.slotLabel.includes('Class 4 Center') && !t.parentSlotLabel)
    expect(centerWeapon).toBeDefined()
    expect(centerWeapon!.type).toBe('Gimbal Mount')
    const result = validateTargetCompatibility(centerWeapon!.factoryItem, centerWeapon!.type, centerWeapon!.size, {
      itemEntityClass: centerWeapon!.factoryEntityClass,
      destinationFactoryEntityClass: centerWeapon!.factoryEntityClass,
    })
    expect(result.valid, result.message).toBe(true)
  })

  it('a genuinely unrelated GENERIC_MOUNT port sharing the same equipmentGroup (Zeus CL\'s tractor beam ARM, RSI_Zeus_Tractor_Beam_Arm — category ToolArm, not Turret) is never relabeled "Gimbal Mount" by the new fallback', () => {
    // Not every port whose factory item happens to be named "Tractor
    // Beam" is this ToolArm shape — some (e.g. Caterpillar's own, a real
    // DRAK_Command_Module_Remote_Turret_Tractor_Beam) are genuinely a
    // Turret-category REMOTE_TURRET assembly that HOUSES a tractor beam
    // weapon, correctly resolved by the assemblyRole switch already, not
    // this fallback at all. Zeus CL's is the real, distinct ToolArm case.
    const def = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Zeus CL')
    if (!def) return
    const template = shipFactoryTemplates[def.id]
    const tractorArm = template.find((t) => t.factoryEntityClass === 'RSI_Zeus_Tractor_Beam_Arm')
    if (!tractorArm) return
    expect(tractorArm.type).not.toBe('Gimbal Mount')
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

/**
 * RC-001A — Grey's Basher Mechanical Promotion. Basher crossed the
 * catalog boundary (EWO-050/RC-001: it resolves a real name/manufacturer
 * and is selectable) before it crossed the Golden Fleet boundary — until
 * this mission it still had `portIds: []` and materialized as an empty
 * mechanical shell, a real release blocker (a newly-added ship the
 * Commander could see but never equip). Promoted via the normal
 * small-delta Golden Fleet workflow (real StarBreaker export, real
 * importer/normalizer/validator, no hand-authored loadout), scoped to
 * this one hull only.
 */
describe("RC-001A: Grey's Basher — authoritative port tree and factory assignments", () => {
  it('resolves via its entity class to the same rich, deep-imported definition as its generated id — no duplicate alias, no catalog-only fallback', () => {
    if (shipCatalogRecords.length === 0) return
    const byEntityClass = shipDefinitionById.get('GLSN_Basher')
    expect(byEntityClass).toBeDefined()
    expect(byEntityClass!.sourceMetadata.sourceType).toBe('StarBreaker')
    expect((byEntityClass!.sourceMetadata as { sourceFile?: string }).sourceFile).toBeUndefined() // deep-imported, not the catalog-only placeholder
    const v = importedShipList.find((x) => x.ship.sourceEntityClass === 'GLSN_Basher')
    expect(v).toBeDefined()
    expect(shipDefinitionById.get(v!.ship.id)).toBe(byEntityClass)
    expect(shipDefinitions.filter((d) => d.id === 'GLSN_Basher')).toHaveLength(0) // never a second entry under the entity class
    expect(selectableShipDefinitions.filter((d) => d.id === v!.ship.id)).toHaveLength(1)
  })

  it('displayName and manufacturer match the real official RSI name ("Grey\'s Basher" / "Grey\'s Market")', () => {
    if (shipCatalogRecords.length === 0) return
    const basher = shipDefinitionById.get('GLSN_Basher')
    if (!basher) return
    expect(basher.displayName).toBe("Grey's Basher")
    expect(basher.manufacturer).toBe("Grey's Market")
  })

  it('produces a non-empty, authoritative 27-port factory template — not the empty catalog-only fallback', () => {
    if (shipCatalogRecords.length === 0) return
    const template = shipFactoryTemplates['GLSN_Basher']
    if (!template) return
    expect(template.length).toBe(27)
  })

  it('materializes with 0 unknown factory items, 0 duplicate slot labels, and 100% readiness — every hardpoint resolves a real component', () => {
    if (shipCatalogRecords.length === 0) return
    const basher = shipDefinitionById.get('GLSN_Basher')
    const template = shipFactoryTemplates['GLSN_Basher']
    if (!basher || !template) return
    const { hardpoints, build } = materializeFleetAsset({ definition: basher, template, ownershipType: 'OWNED', priority: 1 })
    expect(hardpoints).toHaveLength(27)
    expect(hardpoints.filter((h) => h.factoryItem === 'Unknown Factory Item')).toHaveLength(0)
    const slotLabels = hardpoints.map((h) => h.slotLabel)
    expect(new Set(slotLabels).size).toBe(slotLabels.length)
    expect(hardpoints.every((h) => h.installedItem === h.factoryItem && h.targetItem === h.factoryItem)).toBe(true)
    expect(build.readiness).toBe(100)
    expect(build.missing).toEqual([])
  })

  it('known representative factory assignments resolve to real, official component names — including its own real Grey\'s Market weapons (Deathroll, Snapper)', () => {
    if (shipCatalogRecords.length === 0) return
    const basher = shipDefinitionById.get('GLSN_Basher')
    const template = shipFactoryTemplates['GLSN_Basher']
    if (!basher || !template) return
    const { hardpoints } = materializeFleetAsset({ definition: basher, template, ownershipType: 'OWNED', priority: 1 })
    const byType = (type: string) => hardpoints.filter((h) => h.type === type)
    expect(byType('Weapon').length).toBe(6)
    expect(byType('Weapon').some((h) => h.factoryItem === 'Deathroll S2 Gatling')).toBe(true)
    expect(byType('Weapon').some((h) => h.factoryItem === 'Snapper S2 Repeater')).toBe(true)
    expect(byType('Missile Rack').length).toBe(2)
    expect(byType('Power Plant').length).toBe(1)
    expect(byType('Shield').length).toBe(1)
    expect(byType('Quantum Drive').length).toBe(1)
    expect(byType('Life Support').length).toBe(1)
  })
})
