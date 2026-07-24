import { describe, it, expect } from 'vitest'
import { discoverOwnerEntityClasses, extractOwnedPortConstraints, normalizePortEditability } from '../generateComponentOwnedPortConstraints'

describe('discoverOwnerEntityClasses', () => {
  it('collects distinct sourceEntityClass values only from the port-owning assembly roles', () => {
    const result = discoverOwnerEntityClasses([
      { assemblyRole: 'GIMBAL_MOUNT', sourceEntityClass: 'Mount_Gimbal_S3' },
      { assemblyRole: 'GIMBAL_MOUNT', sourceEntityClass: 'Mount_Gimbal_S3' }, // duplicate across two ships/ports — deduped
      { assemblyRole: 'MISSILE_RACK', sourceEntityClass: 'MRCK_S09_AEGS_Eclipse' },
      { assemblyRole: 'GENERIC_MOUNT', sourceEntityClass: 'POWR_JUST_S01_Endurance_SCItem' }, // not a port-owning role — excluded
      { assemblyRole: 'QUANTUM_DRIVE', sourceEntityClass: 'QDRV_TARS_S01_Expedition_SCItem' }, // not in scope for this pass
    ])
    expect(result).toEqual(['MRCK_S09_AEGS_Eclipse', 'Mount_Gimbal_S3'])
  })

  it('skips a row with no sourceEntityClass or no assemblyRole rather than throwing', () => {
    const result = discoverOwnerEntityClasses([
      { assemblyRole: 'GIMBAL_MOUNT', sourceEntityClass: null },
      { assemblyRole: null, sourceEntityClass: 'Mount_Gimbal_S3' },
      {},
    ])
    expect(result).toEqual([])
  })

  it('returns entityClasses sorted, for deterministic generator output regardless of ports.json row order', () => {
    const result = discoverOwnerEntityClasses([
      { assemblyRole: 'MANNED_TURRET', sourceEntityClass: 'Zebra_Turret' },
      { assemblyRole: 'MANNED_TURRET', sourceEntityClass: 'Alpha_Turret' },
    ])
    expect(result).toEqual(['Alpha_Turret', 'Zebra_Turret'])
  })
})

describe('extractOwnedPortConstraints — real DataCore shapes (EWO-055 proving spike)', () => {
  it("a gimbal mount's own record (Mount_Gimbal_S3) — one named port, uniform accept-list", () => {
    const recordValue = {
      Components: [
        { _Type_: 'SAttachableComponentParams' /* no Ports here, like the real record's other components */ },
        {
          _Type_: 'SCItemPortContainerComponentParams',
          Ports: [{ Name: 'hardpoint_class_2', MinSize: 3, MaxSize: 3, Types: [{ Type: 'WeaponGun', SubTypes: ['Gun'] }] }],
        },
      ],
    }
    const { portsByName, anomalies } = extractOwnedPortConstraints(recordValue)
    expect(anomalies).toEqual([])
    expect(portsByName).toEqual({
      hardpoint_class_2: { minSize: 3, maxSize: 3, accepted: [{ type: 'WeaponGun', subtypes: ['Gun'] }], editable: null },
    })
  })

  it('a fixed mount whose entity NAME says "Turret" (ANVL_Valkyrie_Nose_Turret_S3) carries no Turret/GunTurret type entry — confirms names must never be used to infer mount role, only this data', () => {
    const recordValue = {
      Components: [
        {
          Ports: [
            { Name: 'hardpoint_left', MinSize: 3, MaxSize: 3, Types: [{ Type: 'WeaponGun', SubTypes: ['Gun'] }] },
            { Name: 'hardpoint_right', MinSize: 3, MaxSize: 3, Types: [{ Type: 'WeaponGun', SubTypes: ['Gun'] }] },
          ],
        },
      ],
    }
    const { portsByName } = extractOwnedPortConstraints(recordValue)
    expect(Object.keys(portsByName)).toEqual(['hardpoint_left', 'hardpoint_right'])
    expect(portsByName.hardpoint_left.accepted.some((a) => a.type === 'Turret')).toBe(false)
  })

  it('a real manned turret (Hammerhead) carries a second Turret/GunTurret Types entry on its weapon ports, AND unrelated Room/Display ports on the same record — both are captured, generic, never filtered to a "weapon-shaped" subset', () => {
    const recordValue = {
      Components: [
        {
          Ports: [
            {
              Name: 'hardpoint_weapon_left_upper',
              MinSize: 4,
              MaxSize: 4,
              Types: [
                { Type: 'WeaponGun', SubTypes: ['Gun'] },
                { Type: 'Turret', SubTypes: ['GunTurret'] },
              ],
            },
            { Name: 'hardpoint_OC', MinSize: 0, MaxSize: 1, Types: [{ Type: 'Room', SubTypes: [] }] },
            { Name: 'Screen_Left_Bottom', MinSize: 1, MaxSize: 1, Types: [{ Type: 'Display', SubTypes: [] }] },
          ],
        },
      ],
    }
    const { portsByName } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.hardpoint_weapon_left_upper.accepted).toEqual([
      { type: 'WeaponGun', subtypes: ['Gun'] },
      { type: 'Turret', subtypes: ['GunTurret'] },
    ])
    expect(portsByName.hardpoint_OC.accepted).toEqual([{ type: 'Room', subtypes: [] }])
    expect(portsByName.Screen_Left_Bottom.accepted).toEqual([{ type: 'Display', subtypes: [] }])
  })

  it('a missile rack (MRCK_S09_AEGS_Eclipse) carries real Missile/[Missile,Torpedo] type data, not just MinSize/MaxSize — AND its real Flags: "editable" normalizes to editable: true (EWO-056B)', () => {
    const recordValue = {
      Components: [
        {
          Ports: [
            { Name: 'missile_01_attach', MinSize: 9, MaxSize: 9, Types: [{ Type: 'Missile', SubTypes: ['Missile', 'Torpedo'] }], Flags: 'editable' },
            { Name: 'missile_02_attach', MinSize: 9, MaxSize: 9, Types: [{ Type: 'Missile', SubTypes: ['Missile', 'Torpedo'] }], Flags: 'editable' },
          ],
        },
      ],
    }
    const { portsByName } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.missile_01_attach).toEqual({ minSize: 9, maxSize: 9, accepted: [{ type: 'Missile', subtypes: ['Missile', 'Torpedo'] }], editable: true })
  })

  it('an empty Types[] array (confirmed real, e.g. two of AEGS_Gladius\'s own ship-level utility ports) is captured as accepted: [], never treated as missing/unresolved', () => {
    const recordValue = { Components: [{ Ports: [{ Name: 'hardpoint_cockpit_flair_hanging', MinSize: 1, MaxSize: 1, Types: [] }] }] }
    const { portsByName, anomalies } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.hardpoint_cockpit_flair_hanging).toEqual({ minSize: 1, maxSize: 1, accepted: [], editable: null })
    expect(anomalies).toEqual([])
  })
})

describe('normalizePortEditability — EWO-056B authoritative upgrade-authority extraction', () => {
  it('the Command Module tractor beam\'s real Flags: "uneditable" normalizes to false (locked) — the confirmed EWO-056 lock source', () => {
    expect(normalizePortEditability('uneditable')).toBe(false)
  })

  it('"$uneditable" (confirmed real, e.g. the Command Module\'s own hardpoint_relay) is treated as an equivalent locked state, per Objective B', () => {
    expect(normalizePortEditability('$uneditable')).toBe(false)
  })

  it('the missile rack\'s real Flags: "editable" normalizes to true', () => {
    expect(normalizePortEditability('editable')).toBe(true)
  })

  it('missing Flags (undefined, or a non-string value) resolves to null — unknown/unavailable, never guessed', () => {
    expect(normalizePortEditability(undefined)).toBeNull()
    expect(normalizePortEditability(null)).toBeNull()
    expect(normalizePortEditability(42)).toBeNull()
  })

  it('an unrecognized Flags value (confirmed real, e.g. "dockingport1") resolves to null rather than being guessed either way', () => {
    expect(normalizePortEditability('dockingport1')).toBeNull()
  })

  it('an empty Flags string (confirmed real, e.g. Gladius\'s own hardpoint_controller_fuel) resolves to null', () => {
    expect(normalizePortEditability('')).toBeNull()
  })

  it('checks the locked signal before the editable signal, so a hypothetical compound value containing both substrings is never misread as editable', () => {
    // "uneditable" itself contains the substring "editable" — this proves
    // check order, not just final output, is correct.
    expect(normalizePortEditability('uneditable')).toBe(false)
    expect(normalizePortEditability('editable uneditable')).toBe(false)
  })
})

describe('extractPort (via extractOwnedPortConstraints) — Flags/editable threading (EWO-056B)', () => {
  it('a port with no Flags key at all resolves editable: null, same as an explicitly missing field elsewhere in this generator', () => {
    const recordValue = { Components: [{ Ports: [{ Name: 'hardpoint_no_flags_key', MinSize: 1, MaxSize: 1, Types: [] }] }] }
    const { portsByName } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.hardpoint_no_flags_key.editable).toBeNull()
  })

  it('a port with Flags: "uneditable" resolves editable: false', () => {
    const recordValue = { Components: [{ Ports: [{ Name: 'hardpoint_locked', MinSize: 2, MaxSize: 2, Types: [], Flags: 'uneditable' }] }] }
    const { portsByName } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.hardpoint_locked.editable).toBe(false)
  })

  it('a port with Flags: "$uneditable" resolves editable: false', () => {
    const recordValue = { Components: [{ Ports: [{ Name: 'hardpoint_locked_dollar', MinSize: 1, MaxSize: 1, Types: [], Flags: '$uneditable' }] }] }
    const { portsByName } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.hardpoint_locked_dollar.editable).toBe(false)
  })

  it('a port with an unrecognized Flags value (e.g. "dockingport1") resolves editable: null, never crashes extraction of the rest of the record', () => {
    const recordValue = {
      Components: [
        {
          Ports: [
            { Name: 'hardpoint_docking_style', MinSize: 1, MaxSize: 1, Types: [], Flags: 'dockingport1' },
            { Name: 'hardpoint_ordinary', MinSize: 2, MaxSize: 2, Types: [{ Type: 'WeaponGun', SubTypes: ['Gun'] }], Flags: 'editable' },
          ],
        },
      ],
    }
    const { portsByName } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.hardpoint_docking_style.editable).toBeNull()
    expect(portsByName.hardpoint_ordinary.editable).toBe(true)
  })

  it('editable participates in duplicate-name conflict detection exactly like every other field — two entries sharing a Name but disagreeing only on Flags are still excluded as an anomaly', () => {
    const recordValue = {
      Components: [
        { Ports: [{ Name: 'hardpoint_dup_flags', MinSize: 2, MaxSize: 2, Types: [], Flags: 'editable' }] },
        { Ports: [{ Name: 'hardpoint_dup_flags', MinSize: 2, MaxSize: 2, Types: [], Flags: 'uneditable' }] },
      ],
    }
    const { portsByName, anomalies } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.hardpoint_dup_flags).toBeUndefined()
    expect(anomalies).toHaveLength(1)
  })
})

describe('extractOwnedPortConstraints — required edge-case coverage (EWO-055)', () => {
  it('a port missing MinSize/MaxSize keys entirely resolves to null, never a guessed 0 or fabricated value', () => {
    const recordValue = { Components: [{ Ports: [{ Name: 'hardpoint_mystery', Types: [] }] }] }
    const { portsByName } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.hardpoint_mystery).toEqual({ minSize: null, maxSize: null, accepted: [], editable: null })
  })

  it('two Ports[] entries sharing one Name with IDENTICAL constraints are a harmless duplicate — kept, no anomaly', () => {
    const recordValue = {
      Components: [
        { Ports: [{ Name: 'hardpoint_dup', MinSize: 2, MaxSize: 2, Types: [{ Type: 'WeaponGun', SubTypes: ['Gun'] }] }] },
        { Ports: [{ Name: 'hardpoint_dup', MinSize: 2, MaxSize: 2, Types: [{ Type: 'WeaponGun', SubTypes: ['Gun'] }] }] },
      ],
    }
    const { portsByName, anomalies } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.hardpoint_dup).toBeDefined()
    expect(anomalies).toEqual([])
  })

  it('two Ports[] entries sharing one Name with DISAGREEING constraints are excluded entirely and reported as an anomaly — never one value guessed over the other', () => {
    const recordValue = {
      Components: [
        { Ports: [{ Name: 'hardpoint_dup', MinSize: 2, MaxSize: 2, Types: [{ Type: 'WeaponGun', SubTypes: ['Gun'] }] }] },
        { Ports: [{ Name: 'hardpoint_dup', MinSize: 3, MaxSize: 3, Types: [{ Type: 'WeaponGun', SubTypes: ['Gun'] }] }] },
      ],
    }
    const { portsByName, anomalies } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.hardpoint_dup).toBeUndefined()
    expect(anomalies).toHaveLength(1)
    expect(anomalies[0]).toContain('hardpoint_dup')
  })

  it('an unexpected Types[] entry shape (non-object, or a non-string Type) is skipped, never crashes extraction of the rest of a good record', () => {
    const recordValue = {
      Components: [
        {
          Ports: [
            { Name: 'hardpoint_weird', MinSize: 1, MaxSize: 1, Types: ['not-an-object', { Type: 42 }, { Type: 'WeaponGun', SubTypes: ['Gun'] }, null] },
          ],
        },
      ],
    }
    const { portsByName } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.hardpoint_weird.accepted).toEqual([{ type: 'WeaponGun', subtypes: ['Gun'] }])
  })

  it('a non-array SubTypes on an otherwise-valid Types entry defaults to [], never guessed or omitted from the record shape', () => {
    const recordValue = { Components: [{ Ports: [{ Name: 'hardpoint_odd_subtypes', Types: [{ Type: 'Missile', SubTypes: 'not-an-array' }] }] }] }
    const { portsByName } = extractOwnedPortConstraints(recordValue)
    expect(portsByName.hardpoint_odd_subtypes.accepted).toEqual([{ type: 'Missile', subtypes: [] }])
  })

  it('a Ports[] entry with no usable Name is excluded — never assigned a fabricated key', () => {
    const recordValue = { Components: [{ Ports: [{ MinSize: 1, MaxSize: 1, Types: [] }, { Name: '', MinSize: 1, MaxSize: 1, Types: [] }] }] }
    const { portsByName } = extractOwnedPortConstraints(recordValue)
    expect(Object.keys(portsByName)).toEqual([])
  })

  it('a record with no Components[] array, or Components entries with no Ports[], resolves to an empty map rather than throwing', () => {
    expect(extractOwnedPortConstraints({}).portsByName).toEqual({})
    expect(extractOwnedPortConstraints({ Components: [] }).portsByName).toEqual({})
    expect(extractOwnedPortConstraints({ Components: [{ NotPorts: [] }] }).portsByName).toEqual({})
    expect(extractOwnedPortConstraints(null).portsByName).toEqual({})
    expect(extractOwnedPortConstraints(undefined).portsByName).toEqual({})
  })

  it('output key order is deterministic (alphabetical), independent of the source Ports[] array order', () => {
    const recordValue = { Components: [{ Ports: [{ Name: 'zeta', Types: [] }, { Name: 'alpha', Types: [] }, { Name: 'mid', Types: [] }] }] }
    const { portsByName } = extractOwnedPortConstraints(recordValue)
    expect(Object.keys(portsByName)).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('calling extraction twice on the same input produces byte-identical output (pure function, no hidden state/randomness)', () => {
    const recordValue = { Components: [{ Ports: [{ Name: 'hardpoint_a', MinSize: 2, MaxSize: 2, Types: [{ Type: 'WeaponGun', SubTypes: ['Gun'] }] }] }] }
    const first = extractOwnedPortConstraints(recordValue)
    const second = extractOwnedPortConstraints(recordValue)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})
