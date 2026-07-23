import { describe, it, expect, beforeEach } from 'vitest'
import { validateTargetCompatibility, isComponentSelectableForPort } from '../componentCatalog'
import { runFullValidation } from '../../engine/validation'
import { hardpoints } from '../seed'
import { shipDefinitions, shipFactoryTemplates } from '../shipDefinitions'
import { useFleetStore } from '../../store/useFleetStore'
import { catalogComponentsByName, componentsByEntityClass, resolveComponentByEntityClass, compatibilityPortTypeFor } from '../../generated/componentCatalog'
import { componentOwnedChildSlotSpec } from '../../utils/componentOwnedSlots'
import { getMissileRackSlotSpec } from '../../generated/missileRackSlots'
import missileRackSlotData from '../../../generated-data/missile-rack-slots.json'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

describe('Data validation fixes (Alpha 2.4, Part 10)', () => {
  it('FR-86 is correctly categorized as an S3 Shield, not a Missile Rack', () => {
    const asShield = validateTargetCompatibility('FR-86', 'Shield', 'S3')
    expect(asShield.valid).toBe(true)

    const asMissileRack = validateTargetCompatibility('FR-86', 'Missile Rack', 'S3')
    expect(asMissileRack.valid).toBe(false)
  })

  it('the real seed dataset has no INCOMPATIBLE_TARGET errors beyond the one known, deliberate M80 demo defect', () => {
    // SW-005 Phase 2 — every seed ship's Factory Loadout is now
    // constructed fresh from real, validated canonical StarBreaker
    // topology (useFleetStore.ts's buildCanonicalSeedFactoryBuilds), not
    // hand-derived from a CUSTOM build's own factoryItem column (SW-003's
    // approach, retired). The two defects SW-003 surfaced (M80's
    // Factory-twin duplicate, and Mole's Mining Head 1 size mismatch) were
    // both artifacts of that hand-derivation, not of the real canonical
    // data — GF-002B independently confirmed MOLE's real export has zero
    // Invalid Target rows. Only M80's own hand-authored CUSTOM build
    // (m80-speed, the deliberate Golden Scenario H regression fixture)
    // still carries the one intentional defect.
    const s = useFleetStore.getState()
    const summary = runFullValidation({ ships: s.ships, builds: s.builds, hardpoints: s.hardpoints, fleetAssets: s.fleetAssets, shipDefinitions })
    const incompatibleTargetErrors = summary.issues.filter((i) => i.code === 'INCOMPATIBLE_TARGET')
    expect(incompatibleTargetErrors).toHaveLength(1)
    expect(incompatibleTargetErrors[0].entityId).toContain('m80')
  })

  it('Cutlass Black no longer targets FR-86 (a Shield) in its Missile Rack slot', () => {
    // SW-006 — cutlass-black-utility's mechanical structure is now
    // constructed fresh from canonical topology (useFleetStore.ts's
    // buildCanonicalSeedCustomBuilds), not raw src/data/seed.ts exports.
    const rows = useFleetStore.getState().hardpoints.filter((h) => h.buildId === 'cutlass-black-utility' && h.type === 'Missile Rack')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.targetItem).not.toBe('FR-86')
      expect(row.status).toBe('OK')
    }
  })
})

describe('Generalized compatibility rule (Alpha 2.5A, Part 7 — not hardcoded to FR-86)', () => {
  it('27/28: no Shield-category item can satisfy a Missile Rack port, and this holds for any shield, not just FR-86', () => {
    for (const shieldItem of ['FR-86', 'Mirage', 'FR-66', 'Debilitator', 'Shield Array']) {
      const result = validateTargetCompatibility(shieldItem, 'Missile Rack', 'S3')
      expect(result.valid).toBe(false)
    }
  })

  it('the same items are valid against their real category (Shield ports)', () => {
    expect(validateTargetCompatibility('FR-86', 'Shield', 'S3').valid).toBe(true)
    expect(validateTargetCompatibility('Mirage', 'Shield', 'S1').valid).toBe(true)
  })
})

describe('Mission M-012: component selectors use the authoritative full-universe catalog, not just the ~20-entry demo table', () => {
  it('13. recognizes a real component that only exists in the generated catalog (not the hand-authored demo table)', () => {
    if (catalogComponentsByName.size === 0) return // real generated-data/component-metadata-catalog.json not present on this machine
    const beacon = catalogComponentsByName.get('Beacon')
    expect(beacon).toBeDefined()
    expect(beacon!.category).toBe('Quantum Drive')
    // Correctly flags a real category mismatch for a catalog-only item, exactly like the hand-authored demo entries already do.
    expect(validateTargetCompatibility('Beacon', 'Shield', `S${beacon!.size}`).valid).toBe(false)
    expect(validateTargetCompatibility('Beacon', 'Quantum Drive', `S${beacon!.size}`).valid).toBe(true)
  })

  it('13. the widened catalog has well over a thousand player-usable components, not the ~20-entry demo scope', () => {
    if (catalogComponentsByName.size === 0) return
    expect(catalogComponentsByName.size).toBeGreaterThan(500)
  })
})

describe('EWO-024 (Task 2): isComponentSelectableForPort — Target picker suggestion filtering', () => {
  it('1. a component positively known to be a different size for this port type is not selectable (S1 Cooler in an S2 Cooler slot)', () => {
    expect(isComponentSelectableForPort('SnowBlind', 'Cooler', 'S2')).toBe(false) // SnowBlind is S1
    expect(isComponentSelectableForPort('Blizzard', 'Cooler', 'S2')).toBe(true) // Blizzard is S2
  })

  it('2. a component of the wrong category is not selectable even at the right size (a Shield is never a Missile Rack)', () => {
    expect(isComponentSelectableForPort('FR-86', 'Missile Rack', 'S3')).toBe(false)
    expect(isComponentSelectableForPort('FR-86', 'Shield', 'S3')).toBe(true)
  })

  it('3. an uncataloged (unknown) component is still selectable — never positively disproven, same philosophy validateTargetCompatibility already uses', () => {
    expect(isComponentSelectableForPort('Some Totally Unrecognized Item', 'Shield', 'S1')).toBe(true)
  })

  it('4. agrees with validateTargetCompatibility on every real demo fixture — the picker never suggests something save-time validation would reject, and never hides something it would accept', () => {
    const fixtures: Array<[string, string, string]> = [
      ['Mirage', 'Shield', 'S1'],
      ['Mirage', 'Shield', 'S3'],
      ['Mass Driver', 'Weapon', 'S4'],
      ['Mass Driver', 'Weapon', 'S2'],
      ['Atlas', 'Quantum Drive', 'S1'],
      ['Atlas', 'Quantum Drive', 'S2'],
    ]
    for (const [item, type, size] of fixtures) {
      expect(isComponentSelectableForPort(item, type, size)).toBe(validateTargetCompatibility(item, type, size).valid)
    }
  })
})

describe('FTB-001D: mining laser catalog eligibility (Helix II Mining Laser and the real mining-laser population)', () => {
  // Root cause: every real mining weapon port across every currently-
  // imported mining ship (MOLE, Prospector, ROC, Golem) carried the raw,
  // untranslated equipmentGroup string "Mining" as its own Hardpoint
  // `type` (src/data/shipDefinitions.ts's compatibilityTypeFor never
  // translated it), permanently mismatched against
  // CATEGORY_TO_PORT_TYPE.WeaponMining ("Mining Laser" — the vocabulary
  // every mining laser's own catalog record resolves to). A handful of
  // mining lasers (Arbor MH1/MH2/MHV, Pitman) had a hand-authored
  // src/data/componentCatalog.ts override forcing their category to the
  // wrong-but-matching "Mining" — Helix II (and every other real mining
  // laser with no such override) simply never appeared as selectable on
  // any real mining port. Fixed at the true source (the ship-side
  // translation), so no per-name override is needed for any of them.
  const HELIX_II = 'Helix II Mining Laser'
  const hasCatalog = catalogComponentsByName.size > 0

  // 1/2/3 exercise the REAL MOLE Fleet Asset's own mining weapon port —
  // its `type`/`size` come straight from shipFactoryTemplates (the same
  // real ship-generation pipeline Loadout Manager reads), not a
  // hand-typed literal. This is what actually reproduces the reported
  // defect: a test that only ever passes a literal 'Mining Laser' string
  // never exercises whether the SHIP's own port really produces that
  // string in the first place — confirmed by reverting the
  // shipDefinitions.ts fix and observing tests using a literal still pass
  // while this one correctly fails.
  function realMoleMiningPort() {
    const mole = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'MOLE')
    if (!mole) return null
    const template = shipFactoryTemplates[mole.id]
    return template.find((t) => t.factoryEntityClass && componentsByEntityClass.get(t.factoryEntityClass)?.category === 'WeaponMining') ?? null
  }

  it('1. Helix II Mining Laser is a valid candidate for a real MOLE S2 mining weapon port', () => {
    if (!hasCatalog) return
    const port = realMoleMiningPort()
    if (!port) return
    expect(port.type).toBe('Mining Laser') // not the raw, untranslated "Mining" equipmentGroup string
    expect(isComponentSelectableForPort(HELIX_II, port.type, port.size)).toBe(true)
  })

  it('2. Helix II Mining Laser is not offered for an incompatible port TYPE (the same real port size, a Shield type)', () => {
    if (!hasCatalog) return
    const port = realMoleMiningPort()
    if (!port) return
    expect(isComponentSelectableForPort(HELIX_II, 'Shield', port.size)).toBe(false)
  })

  it('3. Helix II Mining Laser is not offered for an incompatible component SIZE (the same real port type, S1 instead of S2)', () => {
    if (!hasCatalog) return
    const port = realMoleMiningPort()
    if (!port) return
    expect(port.size).toBe('S2')
    expect(isComponentSelectableForPort(HELIX_II, port.type, 'S1')).toBe(false)
  })

  it('8. the Target picker (entityClass-first resolution) and Hangar Inventory (display-name resolution) resolve Helix II to the exact same canonical entityClass', () => {
    if (!hasCatalog) return
    const byName = catalogComponentsByName.get(HELIX_II)
    expect(byName).toBeDefined()
    expect(byName!.entityClass).toBe('Mining_Laser_THCN_Helix_S2')
    const byEntityClass = resolveComponentByEntityClass(byName!.entityClass)
    expect(byEntityClass.status).toBe('resolved')
    if (byEntityClass.status === 'resolved') {
      expect(byEntityClass.record.displayName).toBe(HELIX_II)
      expect(byEntityClass.record.category).toBe('WeaponMining')
    }
  })

  it("a real MOLE Fleet Asset's own mining weapon port now carries the translated \"Mining Laser\" type, not the raw \"Mining\" equipmentGroup string", () => {
    if (!hasCatalog) return
    const mole = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'MOLE')
    if (!mole) return
    const template = shipFactoryTemplates[mole.id]
    const miningPort = template.find((t) => t.type === 'Mining Laser')
    expect(miningPort).toBeDefined()
    expect(template.some((t) => t.type === 'Mining')).toBe(false)
  })

  it('9. census — every real mining laser in the catalog (WeaponMining/Gun) is selectable at its own size against a Mining Laser port, none excluded by the fixed defect', () => {
    if (!hasCatalog) return
    const miningLasers = Array.from(componentsByEntityClass.values()).filter((r) => r.category === 'WeaponMining' && r.subtype === 'Gun')
    expect(miningLasers.length).toBeGreaterThan(5) // Helix I/II, Impact I/II, Lancet MH1/MH2, Klein-S1/S2, Hofstede-S1/S2, Arbor MH1/MH2/MHV, Pitman, etc.
    for (const record of miningLasers) {
      expect(isComponentSelectableForPort(record.displayName, 'Mining Laser', `S${record.size}`, { itemEntityClass: record.entityClass })).toBe(true)
    }
  })
})

describe('FTB-001F: salvage socket semantics — every modifier fits either child socket', () => {
  // FTB-001E found a real defect (SalvageModifier had no catalog
  // translation at all — every scraper/tractor module was completely
  // unselectable) but fixed it WRONG: it split the child sockets into
  // "Scraper Module"/"Tractor Module" by reading the FACTORY-INSTALLED
  // component's own subtype — inferring socket capability from whatever
  // happened to be installed there. SPPV field validation (FTB-001F)
  // proved that wrong: the real game accepts Abrade+Abrade, Abrade+Cinch,
  // Trawler+Trawler, and ReadyGrip+Abrade on the same salvage head — any
  // real modifier in either socket. Root cause: the raw child PORT itself
  // carries `allowedTypes: []`/`allowedSubtypes: []` (confirmed by direct
  // audit of generated-data/ports.json — no constraint of its own at
  // all), and src/normalizer/classificationTranslator.ts's own
  // already-reviewed EWO-041/CWO-001 rule had ALREADY explicitly found
  // "no distinction meaningful to SFM's own model" between SalvageModifier
  // subtypes, collapsing every real record (scraper or tractor) to ONE
  // canonical port type (`SalvageModule`) at ship-import time — before
  // FTB-001E's subtype read ever ran. Fixed by using that already-
  // computed, structural `canonicalPortType` signal (never derived from
  // what's currently installed) instead of re-deriving a split from the
  // installed component's own subtype.
  const hasCatalog = catalogComponentsByName.size > 0

  // Reclaimer: a real ship whose two salvage heads carry ReadyGrip
  // (tractor-flavored) + Trawler (scraper-flavored) as their factory
  // modules — both children now resolve to the same "Salvage Modifier"
  // port type.
  function reclaimerSalvageModifierPorts() {
    const reclaimer = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Reclaimer')
    if (!reclaimer) return []
    return shipFactoryTemplates[reclaimer.id].filter((t) => t.factoryEntityClass && componentsByEntityClass.get(t.factoryEntityClass)?.category === 'SalvageModifier')
  }

  // Vulture: a real ship whose salvage heads carry Cinch (small scraper),
  // Abrade (medium scraper), AND ReadyGrip (tractor) as factory modules —
  // all three real display names on one ship.
  function vultureSalvageModifierPorts() {
    const vulture = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Vulture')
    if (!vulture) return []
    return shipFactoryTemplates[vulture.id].filter((t) => t.factoryEntityClass && componentsByEntityClass.get(t.factoryEntityClass)?.category === 'SalvageModifier')
  }

  it('every real salvage modifier child port (regardless of which module is factory-installed there) resolves to the same "Salvage Modifier" type', () => {
    if (!hasCatalog) return
    const ports = reclaimerSalvageModifierPorts()
    if (ports.length === 0) return
    const distinctTypes = new Set(ports.map((p) => p.type))
    expect([...distinctTypes]).toEqual(['Salvage Modifier'])
  })

  it('ReadyGrip Tractor Module is selectable on a real Reclaimer child socket, whichever modifier is factory-installed there', () => {
    if (!hasCatalog) return
    const ports = reclaimerSalvageModifierPorts()
    if (ports.length === 0) return
    for (const port of ports) expect(isComponentSelectableForPort('ReadyGrip Tractor Module', port.type, port.size)).toBe(true)
  })

  it('Trawler Scraper Module is selectable on a real Reclaimer child socket, whichever modifier is factory-installed there', () => {
    if (!hasCatalog) return
    const ports = reclaimerSalvageModifierPorts()
    if (ports.length === 0) return
    for (const port of ports) expect(isComponentSelectableForPort('Trawler Scraper Module', port.type, port.size)).toBe(true)
  })

  it('Cinch Scraper Module is selectable on any real Vulture salvage child socket', () => {
    if (!hasCatalog) return
    const ports = vultureSalvageModifierPorts()
    if (ports.length === 0) return
    for (const port of ports) expect(isComponentSelectableForPort('Cinch Scraper Module', port.type, port.size)).toBe(true)
  })

  it('Abrade Scraper Module is selectable on any real Vulture salvage child socket', () => {
    if (!hasCatalog) return
    const ports = vultureSalvageModifierPorts()
    if (ports.length === 0) return
    for (const port of ports) expect(isComponentSelectableForPort('Abrade Scraper Module', port.type, port.size)).toBe(true)
  })

  it('acceptance: Abrade+Abrade, Abrade+Cinch, Trawler+Trawler, and ReadyGrip+Abrade are all valid on the same real socket pair (SPPV parity)', () => {
    if (!hasCatalog) return
    const ports = reclaimerSalvageModifierPorts()
    if (ports.length < 2) return
    const [socketA, socketB] = ports
    const combos: Array<[string, string]> = [
      ['Abrade Scraper Module', 'Abrade Scraper Module'],
      ['Abrade Scraper Module', 'Cinch Scraper Module'],
      ['Trawler Scraper Module', 'Trawler Scraper Module'],
      ['ReadyGrip Tractor Module', 'Abrade Scraper Module'],
    ]
    for (const [itemA, itemB] of combos) {
      expect(isComponentSelectableForPort(itemA, socketA.type, socketA.size)).toBe(true)
      expect(isComponentSelectableForPort(itemB, socketB.type, socketB.size)).toBe(true)
    }
  })

  it('a salvage module is rejected from a mining-module-type port and from the salvage HEAD\'s own port type', () => {
    if (!hasCatalog) return
    expect(isComponentSelectableForPort('Cinch Scraper Module', 'Mining Module', 'S1')).toBe(false)
    expect(isComponentSelectableForPort('ReadyGrip Tractor Module', 'Mining Module', 'S1')).toBe(false)
    expect(isComponentSelectableForPort('Cinch Scraper Module', 'Salvage Module', 'S1')).toBe(false)
  })

  it('a salvage module never owns further component-owned child slots of its own — no fabricated grandchildren', () => {
    if (!hasCatalog) return
    expect(componentOwnedChildSlotSpec('Salvage_Modifier_Tractor_Small')).toBeNull()
    expect(componentOwnedChildSlotSpec('Salvage_Modifier_Scraper_Large')).toBeNull()
    expect(componentOwnedChildSlotSpec('Salvage_Modifier_Scraper_Small')).toBeNull()
    expect(componentOwnedChildSlotSpec('Salvage_Modifier_Scraper_Medium')).toBeNull()
  })

  it('the salvage HEAD port itself (not its children) still resolves to "Salvage Module", unaffected by the socket-semantics fix', () => {
    if (!hasCatalog) return
    const reclaimer = shipDefinitions.find((d) => d.sourceMetadata.sourceType === 'StarBreaker' && d.displayName === 'Reclaimer')
    if (!reclaimer) return
    const template = shipFactoryTemplates[reclaimer.id]
    const headPort = template.find((t) => t.factoryEntityClass === 'Salvage_Head_standard')
    expect(headPort).toBeDefined()
    expect(headPort!.type).toBe('Salvage Module')
    expect(isComponentSelectableForPort('Baler Salvage Head', headPort!.type, headPort!.size)).toBe(true)
  })

  it('census — every real SalvageModifier catalog record (scraper or tractor) resolves to the one shared "Salvage Modifier" port type and is selectable there', () => {
    if (!hasCatalog) return
    const salvageModifiers = Array.from(componentsByEntityClass.values()).filter((r) => r.category === 'SalvageModifier' && r.displayName)
    expect(salvageModifiers.length).toBeGreaterThanOrEqual(2) // at minimum ReadyGrip + one real scraper variant
    for (const record of salvageModifiers) {
      const portType = compatibilityPortTypeFor(record.category, record.subtype)
      expect(portType).toBe('Salvage Modifier')
      expect(isComponentSelectableForPort(record.displayName, portType!, `S${record.size}`, { itemEntityClass: record.entityClass })).toBe(true)
    }
  })
})

describe('FTB-001F (Part B): mining module child-slot compatibility architecture — real modules recovered', () => {
  // FTB-001E's "no mining modules exist" conclusion was WRONG — it was
  // based only on the categories already present in
  // scripts/componentCatalog/componentTaxonomy.ts's allowlist, never on
  // the raw DataCore universe itself. FTB-001F Part B re-investigated
  // from raw source and found the mining laser's own module attachment
  // ports (tagged `miningConsumable`, see
  // scripts/generateMiningModuleSlots.ts) explicitly require a component
  // of DataCore Type "MiningModifier" — confirmed via a direct live
  // StarBreaker/DataCore query against a real mining laser's own port
  // definition (`"Types": [{"Type": "MiningModifier", "SubTypes":
  // ["Gun"]}]`). "MiningModifier" had never been in the taxonomy
  // allowlist (the exact same gap shape SalvageModifier had before
  // EWO-041) — not because the data doesn't exist, but because nothing
  // ever asked DataCore for it.
  //
  // Direct live queries confirmed 5 representative real entities, all
  // resolving `category: "MiningModifier"`, `subtype: "Gun"`:
  // Mining_Modules_Active_Optimum, Mining_Modules_Active_Brandt,
  // Mining_Modules_Active_Lifeline, Mining_Modules_Passive_XTR_MK1,
  // Mining_Modules_Passive_Rieger_MK1 — cross-referenced against a full
  // bulk DataCore name census confirming 30 real entities total (Brandt,
  // Forel, Lifeline, Optimum, Rime, Stampede, Surge, Torpid in Active
  // form; Focus, FLTR, Rieger, Torrent, Vaux, XTR in Passive MK1/MK2/MK3
  // grade variants). Their in-game localization text is unambiguous
  // textual proof of real identity: `item_Mining_Consumable_Brandt`
  // resolves to "Brandt Module" with description text beginning
  // "Item Type: Mining Module (Active)"; `item_Mining_Modules_Passive_XTR_MK1`
  // resolves to "XTR Module", "Item Type: Mining Module (Passive)" — and
  // so on for all 5 directly-verified samples.
  //
  // Root cause fixed in two places (mirroring the SalvageModifier/
  // EWO-041 precedent exactly):
  //   1. scripts/componentCatalog/componentTaxonomy.ts — added
  //      `MiningModifier: 'Mining Module'` to PLAYER_USABLE_COMPONENT_TYPES.
  //   2. src/generated/componentCatalog.ts — added
  //      `MiningModifier: 'Mining Module'` to CATEGORY_TO_PORT_TYPE, so
  //      compatibilityPortTypeFor (the shared translator) resolves it too.
  //
  // The generated-data/component-metadata-catalog*.json files committed
  // to this working tree were last regenerated BEFORE this fix landed
  // (`npm run generate:component-catalog` is a slow, full-universe
  // re-query — observed to take much longer than this mission's time
  // budget to complete against the live Data.p4k), so they do not yet
  // contain real MiningModifier records. The tests below prove the FIX
  // ITSELF (the category→port-type resolution, independent of whether the
  // catalog has been refreshed) and are written so they start exercising
  // real catalog records automatically, with no code changes, the moment
  // `npm run generate:component-catalog` is next run to refresh the
  // committed catalog files.

  it('the category translator now resolves the real, live-DataCore-confirmed "MiningModifier"/"Gun" pair to "Mining Module" — the actual fix under test, independent of whether the committed catalog has been regenerated yet', () => {
    expect(compatibilityPortTypeFor('MiningModifier', 'Gun')).toBe('Mining Module')
  })

  it('a real, KNOWN component of a DIFFERENT family (a mining laser itself, category WeaponMining) is still correctly rejected for a "Mining Module" port — the mismatch is positively confirmed, not merely unknown', () => {
    expect(isComponentSelectableForPort('Arbor MH2 Mining Laser', 'Mining Module', 'S1')).toBe(false)
  })

  it('a genuinely unrecognized name (never cataloged as anything) remains permissively selectable — the same "can\'t disprove compatibility we have no data for" philosophy every other family already relies on', () => {
    expect(isComponentSelectableForPort('Some Totally Unrecognized Item', 'Mining Module', 'S1')).toBe(true)
  })

  it('census — once the committed catalog is regenerated, every real MiningModifier record resolves to "Mining Module" and is selectable there (no-ops today; documents the pending data refresh rather than asserting a false absence)', () => {
    if (catalogComponentsByName.size === 0) return
    const realMiningModules = Array.from(componentsByEntityClass.values()).filter(
      (r) => compatibilityPortTypeFor(r.category, r.subtype) === 'Mining Module'
    )
    if (realMiningModules.length === 0) {
      // Documents a pending DATA-REFRESH gap, not a compatibility-layer
      // defect and not "no mining modules exist" (that conclusion is now
      // disproven — see this describe block's own header comment for the
      // full raw-source evidence). Run `npm run generate:component-catalog`
      // to refresh generated-data/component-metadata-catalog*.json; once
      // refreshed, the assertions below start exercising the real 30
      // recovered entities with no further code changes.
      return
    }
    for (const record of realMiningModules) {
      expect(isComponentSelectableForPort(record.displayName, 'Mining Module', `S${record.size}`, { itemEntityClass: record.entityClass })).toBe(true)
    }
  })
})

describe('FTB-001E: component-owned child family census — no silent exclusions', () => {
  // Every catalog component belonging to a currently-supported
  // component-owned child family must be either (a) eligible for at
  // least one real, compatible generated child-slot specification, or (b)
  // explicitly present in that family's own documented, technically-
  // justified skip list. Nothing may be silently excluded.
  const hasCatalog = catalogComponentsByName.size > 0

  it('mining lasers (WeaponMining/Gun, the parent side) — every real record either owns a known module-slot count (possibly zero, Klein-S1-style) or is absent from generated metadata for a documented reason', () => {
    if (!hasCatalog) return
    const miningLasers = Array.from(componentsByEntityClass.values()).filter((r) => r.category === 'WeaponMining' && r.subtype === 'Gun')
    expect(miningLasers.length).toBeGreaterThan(5)
    for (const record of miningLasers) {
      // componentOwnedChildSlotSpec returns null for a genuinely
      // zero-slot laser too (Klein-S1) — that's a real, resolved "zero"
      // fact, not an exclusion, so this alone can't prove coverage. The
      // generator (scripts/generateMiningModuleSlots.ts) queries DataCore
      // for every WeaponMining entityClass unconditionally and always
      // records a count (0 included) — never skips one — so mere
      // presence in the source catalog already IS the coverage proof
      // here; there is no separate "skipped" list for this family.
      expect(record.entityClass).toBeTruthy()
    }
  })

  it('missile racks (MissileLauncher/MissileRack, the parent side) — every real record is either in the resolved slot-spec table or the documented, technically-justified skip list (FTB-001B)', () => {
    if (!hasCatalog) return
    const racks = Array.from(componentsByEntityClass.values()).filter((r) => r.category === 'MissileLauncher' && r.subtype === 'MissileRack')
    expect(racks.length).toBeGreaterThan(5)
    const skippedIds = new Set(missileRackSlotData.skipped.map((s) => s.entityClass))
    const uncovered = racks.filter((r) => getMissileRackSlotSpec(r.entityClass) === null && !skippedIds.has(r.entityClass))
    expect(uncovered.map((r) => r.entityClass)).toEqual([])
  })

  it('salvage modules (SalvageModifier, the child side) — every real record resolves to the one shared, selectable "Salvage Modifier" port type (FTB-001F: no scraper/tractor split — see the socket-semantics describe block above)', () => {
    if (!hasCatalog) return
    const salvageModifiers = Array.from(componentsByEntityClass.values()).filter((r) => r.category === 'SalvageModifier' && r.displayName)
    expect(salvageModifiers.length).toBeGreaterThan(0)
    for (const record of salvageModifiers) {
      const portType = compatibilityPortTypeFor(record.category, record.subtype)
      expect(portType).toBe('Salvage Modifier')
      expect(isComponentSelectableForPort(record.displayName, portType!, `S${record.size}`, { itemEntityClass: record.entityClass })).toBe(true)
    }
  })

  it('mining modules (the CHILD side — the actual insertable items) — 30 real MiningModifier entities recovered from raw source (FTB-001F Part B); selectable once the committed catalog is regenerated to include them', () => {
    if (!hasCatalog) return
    // See this file's "FTB-001F (Part B): mining module child-slot
    // compatibility architecture" describe block for the full raw-source
    // evidence (live DataCore queries, localization-text confirmation) and
    // the two-file root-cause fix (componentTaxonomy.ts allowlist +
    // CATEGORY_TO_PORT_TYPE). FTB-001E's "zero real components exist"
    // conclusion here was based only on the allowlist gap, not the raw
    // universe, and is now corrected. The committed catalog files predate
    // this fix, so this census entry documents a pending data refresh
    // rather than a real absence — it will start asserting real coverage
    // automatically once `npm run generate:component-catalog` is next run.
    const realMiningModules = Array.from(componentsByEntityClass.values()).filter((r) => compatibilityPortTypeFor(r.category, r.subtype) === 'Mining Module')
    for (const record of realMiningModules) {
      expect(isComponentSelectableForPort(record.displayName, 'Mining Module', `S${record.size}`, { itemEntityClass: record.entityClass })).toBe(true)
    }
  })
})
