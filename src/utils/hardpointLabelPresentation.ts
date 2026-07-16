/**
 * EWO-036A/EWO-036B — Loadout Manager hardpoint label presentation
 * (display only).
 *
 * `Hardpoint.slotLabel` (src/data/shipDefinitions.ts's `importedFactoryTemplate`)
 * is a canonical, uniqueness-guaranteed identifier built by joining each
 * ancestor's own presentation name with " — " (e.g. "Left Wing Weapon
 * (Gimbal Mount) — Class 2"). It is load-bearing: parent/child tree
 * linking (`buildPortTree`), Remove Installed Component matching, and
 * every existing test all depend on this exact string — this module
 * NEVER touches it. It only computes what to *render* for a row, given
 * that row's own `slotLabel` — the canonical value passed to
 * `onRemoveComponent`/tree-building is always the untouched original.
 *
 * The tree UI already shows ancestor context via nesting/indentation
 * (Ship Detail/Loadout Manager expand a parent row to reveal its
 * children) — so a nested row only needs to display its own local
 * identity, not repeat its full ancestor chain. `formatHardpointLabel`
 * therefore always operates on the LAST " — "-delimited segment of the
 * label (that row's own local name), regardless of nesting depth — this
 * is depth-agnostic by construction, confirmed against a real depth-4
 * nested label in EWO-036B's own audit (a Caterpillar docking-turret
 * chain: "Docking Module — Itemport Vehicle Attach — Top Remote Turret —
 * Left Duel Turret — Class 2", whose leaf "Class 2" still resolves to
 * "Weapon" correctly regardless of the four ancestor segments before it).
 *
 * EWO-036B additionally validated this module (read-only) against all
 * 250 currently-staged Golden Fleet exports (`staging-data/golden-fleet/`,
 * gitignored, never itself a test dependency — see this file's own test
 * suite, which encodes representative findings as literal, self-contained
 * fixtures rather than reading that ephemeral directory at test time) in
 * addition to the 6 already-in-`generated-data` deep-imported ships. That
 * audit surfaced real-world label shapes well beyond EWO-036A's own
 * illustrative examples:
 *   - reversed attach-slot order ("Attach Missile 12", not just
 *     "12 Attach Missile");
 *   - a leading position word on the slot itself ("Right 01 Attach
 *     Missile");
 *   - multi-word position qualifiers ("Left Top Front Missile Rack",
 *     "Left Rear Weapon Missile Rack") — already handled correctly by
 *     this module's minimal-strip design with no changes required;
 *   - bare/lettered/numbered racks with no leading position at all
 *     ("Missile Rack 3", "A Missile Rack", "Torpedo Rack L") — safely
 *     fall through to the conservative fallback, unchanged;
 *   - no bomb racks, countermeasure ports, mining/salvage modules, or
 *     tractor-beam MOUNTS exist anywhere in the currently-available
 *     258-hull dataset (a "Tractorbeam Relay" exists, but classifies as
 *     an ordinary Relay port, not a distinct mount/rack assembly) — so
 *     the "Bomb Slot N" rule below is a structural generalization of the
 *     already-evidenced "N Attach {Type}" convention (proven for
 *     Missile across 256 real ships), never a fabricated bomb-specific
 *     rule; it activates automatically the moment real bomb data exists,
 *     per this mission's own conditional instruction ("when the node
 *     role and hierarchy prove they are bomb attachment slots").
 */

const POSITION_PREFIX = /^(Left|Right|Top|Bottom|Nose)\b\s*/i

/** Strips CIG engineering artifacts the mission calls out by name — never touches position/Turret/Remote Turret/Missile Rack wording. */
function stripEngineeringTokens(s: string): string {
  return s
    .replace(/\b(Gun\s+)?Class\s*\d+\b/gi, '')
    .replace(/\bHardpoint\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function capitalizeWord(word: string): string {
  return word.length > 0 ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word
}

/**
 * Recognizes the "N Attach {Type}" StarBreaker naming convention in any
 * of its three confirmed real orderings — "01 Attach Missile", "Attach
 * Missile 1", and a leading position word on the slot itself ("Right 01
 * Attach Missile") — and returns the attached item's type word plus its
 * slot number. The leading position (when present on the slot itself,
 * not just inherited from an ancestor segment) is discarded, matching
 * this mission's own example of dropping position for slot children.
 * Generalized to any `{Type}` word (not hardcoded to "Missile") so a
 * genuine "N Attach Bomb" pattern — never observed in currently
 * available data, per this module's own header — resolves to "Bomb Slot
 * N" automatically without inventing bomb-specific logic.
 */
function extractAttachSlot(leaf: string): { type: string; num: number } | null {
  const withoutPosition = leaf.replace(POSITION_PREFIX, '').trim()

  let m = /^0*(\d+)\s+Attach\s+(\w+)$/i.exec(withoutPosition)
  if (m) return { type: m[2], num: Number(m[1]) }

  m = /^Attach\s+(\w+)\s+0*(\d+)$/i.exec(withoutPosition)
  if (m) return { type: m[1], num: Number(m[2]) }

  return null
}

/**
 * A rack's own top-level (or nested) row name — always reduces to
 * "{Position} [distinguishing qualifier] {Type} Rack", stripping only
 * pure filler — never a qualifier that could be the only thing telling
 * two racks on the same side apart. `rackType` is whichever known
 * payload word ("Missile" or "Bomb" — the only two this mission names)
 * is actually present in the raw text; absent entirely, the generic word
 * "Rack" is used rather than guessing one.
 *
 * Only the exact "Weapon {Missile|Bomb}" idiom (the two words directly
 * adjacent, matching Avenger Titan/Gladius's real "Left Wing Weapon
 * Missile Rack" phrasing) is treated as filler and merged into the type
 * word alone. A standalone "Weapon" NOT immediately followed by the type
 * word is preserved untouched — confirmed necessary against a real
 * EWO-036B finding: MISC Fury Miru has two genuinely distinct hardpoints
 * at the identical position, "Left Top Weapon" and "Left Top Missile"
 * (both classified MISSILE_RACK by the generic assembly-role heuristic),
 * where "Weapon" vs "Missile" is the *only* distinguishing text — an
 * earlier version of this function that unconditionally stripped any
 * standalone "Weapon" collapsed both to the same displayed label.
 */
function formatRackLeaf(leaf: string, prefixLength: number, position: string): string {
  let rest = leaf.slice(prefixLength)
  const typeMatch = /\b(Missile|Bomb)\b/i.exec(rest)
  const rackType = typeMatch ? capitalizeWord(typeMatch[1]) : ''
  rest = rest
    .replace(/\bWeapon\s+(Missile|Bomb)\b/gi, '$1')
    .replace(/\([\w\s]*?Rack\)/gi, '')
    .replace(/\bWing\b/gi, '')
    .replace(/\bRack\b/gi, '')
    .replace(/\b0+(\d)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Never re-append "{rackType} Rack" if `rest` already ends with that
  // exact type word (avoids "Mount A Missile Missile Rack") — but a
  // standalone type word elsewhere in `rest` (e.g. Fury Miru's bare
  // "Weapon") is left exactly as-is, never stripped, so it keeps
  // distinguishing this row from a same-position sibling that used the
  // other type word.
  const endsWithType = rackType !== '' && new RegExp(`\\b${rackType}$`, 'i').test(rest)
  const suffix = endsWithType ? 'Rack' : rackType ? `${rackType} Rack` : 'Rack'
  return rest ? `${position} ${rest} ${suffix}` : `${position} ${suffix}`
}

function formatLeaf(leaf: string): string {
  // Any attachment terminal slot under a rack: "01 Attach Missile" / "Attach Missile 1" -> "Missile Slot 1"; generalizes to "Bomb Slot N" the moment real bomb data exists.
  const attachSlot = extractAttachSlot(leaf)
  if (attachSlot) return `${capitalizeWord(attachSlot.type)} Slot ${attachSlot.num}`

  // A bare weapon-class terminal under a gimbal/weapon mount: "Class 2" -> "Weapon".
  if (/^(Gun\s+)?Class\s*\d+$/i.test(leaf)) return 'Weapon'

  // A gimbal/weapon mount row itself (top-level or nested): "... (Gimbal Mount)" / "... (Weapon Mount)".
  const mountMatch = /^(.*?)\s*\((?:Gimbal Mount|Weapon Mount)\)\s*$/i.exec(leaf)
  if (mountMatch) {
    const cleaned = stripEngineeringTokens(mountMatch[1])
    return cleaned ? `${cleaned} Mount` : 'Weapon Mount'
  }

  // A rack row itself (Missile Rack, or Bomb Rack if it ever exists), with or without a parenthetical suffix.
  const positionMatch = POSITION_PREFIX.exec(leaf)
  if (positionMatch && /\brack\b/i.test(leaf)) {
    return formatRackLeaf(leaf, positionMatch[0].length, positionMatch[1])
  }

  // Everything else (Manned Turret / Remote Turret / generic Mount rows,
  // docking/vehicle-attach nodes, seed-authored labels, anything not
  // matching a known engineering pattern) — conservative cleanup only,
  // per the mission's explicit instruction to KEEP Turret/Remote
  // Turret/Missile Rack wording and never blindly restructure text this
  // module has no evidenced pattern for.
  return stripEngineeringTokens(leaf)
}

/**
 * Formats a canonical `Hardpoint.slotLabel` for display. Pure and
 * side-effect-free — never mutates or re-derives the canonical string
 * itself. Safe to call on any label, including plain seed-authored
 * labels ("Weapon 1", "Shield Generator") which pass through unchanged
 * (none of the patterns above match simple hand-authored text).
 */
export function formatHardpointLabel(rawSlotLabel: string): string {
  const segments = rawSlotLabel.split(' — ')
  const leaf = segments[segments.length - 1].trim()
  const formatted = formatLeaf(leaf)
  return formatted || rawSlotLabel
}
