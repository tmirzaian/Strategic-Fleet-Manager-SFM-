import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ShipNormalizer } from '../shipNormalizer'

const RAW_DATA_DIR = resolve(__dirname, '../../../raw-data')

/**
 * SW-013C.2E (Objective 1): Hornet Mk II Nose Turret Discovery.
 *
 * Exhaustive re-investigation (this mission) confirmed a REAL Mk II nose
 * turret exists in LIVE data: `ANVL_Hornet_F7C_Mk2_Nose_Turret` (category
 * Turret/CanardTurret, S3, 2 real S2 WeaponGun child ports), a confirmed
 * member of a real, tight (2-member, category "A-confirmed") swap group —
 * `ANVL_Hornet_Mk2` — discovered on `hardpoint_weapon_nose`, a real,
 * positioned hardpoint node (confirmed via its own bone_to_world transform
 * data) present on the Ghost's (`ANVL_Hornet_F7CS_Mk2`) own 3D model. The
 * base F7CM_Mk2/F7A_Mk2 variants factory-ship this exact port occupied
 * (with the older `ANVL_Hornet_F7A_Nose_Turret`); the Ghost, F7C_Mk2, and
 * F7CR_Mk2 all leave it factory-EMPTY — a real design choice (the stealth/
 * recon-lineage variants forgo the offensive nose turret), not an absent
 * mount point.
 *
 * The remaining gap: SFM's entire import pipeline only ever creates a
 * `Port` from an OCCUPIED `doc.loadout` entry — a real, physically-present
 * hardpoint that a specific ship variant ships factory-empty is invisible
 * to the normalizer regardless of how much confirmed compatibility data
 * exists for the identical port name on a sibling ship. Materializing it
 * safely requires a genuinely new, cross-ship-aware "confirmed real but
 * factory-empty port" capability that does not exist anywhere in this
 * codebase yet (distinct from `componentOwnedChildSlotSpec`'s existing
 * per-ENTITY child-slot synthesis, which only ever activates once a
 * parent PORT already exists and is targeted) — building it for this one
 * case risks exactly the "speculative implementation" the mission's own
 * Stop Conditions warn against. This test locks in the CURRENT, honest
 * state (no fabricated topology) as a deliberate regression guard: if a
 * future mission adds this capability, this test must be updated
 * alongside it, never silently left stale.
 */
describe('SW-013C.2E (Objective 1): Hornet Ghost Mk II — Nose Turret remains correctly un-materialized pending a new pipeline capability', () => {
  it('the Ghost does not import a hardpoint_weapon_nose port — the real, confirmed nose turret data lives on a sibling variant, not on the Ghost itself', () => {
    const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, 'ANVL_Hornet_F7CS_Mk2.json'), 'utf-8'))
    const pkg = new ShipNormalizer().normalize(raw, 'raw-data/ANVL_Hornet_F7CS_Mk2.json')
    const noseWeapon = pkg.ports.find((p) => p.internalName === 'hardpoint_weapon_nose')
    expect(noseWeapon).toBeUndefined()
  })

  it('the Ghost\'s own Nose Cone port (the aerodynamic cap) is unaffected by this finding — still real, still correctly classified', () => {
    const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, 'ANVL_Hornet_F7CS_Mk2.json'), 'utf-8'))
    const pkg = new ShipNormalizer().normalize(raw, 'raw-data/ANVL_Hornet_F7CS_Mk2.json')
    const noseCone = pkg.ports.find((p) => p.internalName === 'hardpoint_nose_cone')
    expect(noseCone).toBeDefined()
    expect(noseCone!.canonicalPortType).toBe('Module')
  })

  it('the sibling F7CM Mk2 variant DOES import the same physical hardpoint, occupied — confirming the port name is real and not Ghost-specific fiction', () => {
    const raw = JSON.parse(readFileSync(resolve(RAW_DATA_DIR, 'ANVL_Hornet_F7CM_Mk2.json'), 'utf-8'))
    const pkg = new ShipNormalizer().normalize(raw, 'raw-data/ANVL_Hornet_F7CM_Mk2.json')
    const noseWeapon = pkg.ports.find((p) => p.internalName === 'hardpoint_weapon_nose')
    expect(noseWeapon).toBeDefined()
    expect(noseWeapon!.canonicalPortType).toBe('WeaponTurret')
  })
})
