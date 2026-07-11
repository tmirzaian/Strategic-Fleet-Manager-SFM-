/**
 * `DisplayNameGenerator` — turns a raw StarBreaker internal port name into
 * a player-friendly label, plus a separate `positionLabel` when the name
 * carries positional information. Generalized from the Gladius
 * proof-of-concept's one-off hardpoint-name logic; this version also
 * supports an override map for names that don't decompose cleanly.
 *
 * Examples (all verified in src/normalizer/__tests__/displayNameGenerator.test.ts):
 *   hardpoint_gun_left_wing              -> "Left Wing Weapon"
 *   hardpoint_gun_right_wing             -> "Right Wing Weapon"
 *   hardpoint_shield_generator_left      -> "Left Shield Generator"
 *   hardpoint_quantum_drive              -> "Quantum Drive"
 *   hardpoint_cooler_right               -> "Right Cooler"
 *   hardpoint_missilerack_left_wing_outer -> "Left Outer Wing Missile Rack"
 */

/** Glued compound words StarBreaker sometimes uses without underscores —
 * un-glued before tokenizing so phrase matching below can find them. */
const GLUED_COMPOUNDS: Array<[RegExp, string]> = [
  [/missilerack/gi, 'missile_rack'],
  [/powerplant/gi, 'power_plant'],
  [/quantumdrive/gi, 'quantum_drive'],
  [/shieldgenerator/gi, 'shield_generator'],
  [/cargogrid/gi, 'cargo_grid'],
  [/lifesupport/gi, 'life_support'],
]

const TYPE_PHRASES: Array<{ tokens: string[]; canonical: string }> = [
  { tokens: ['power', 'plant'], canonical: 'Power Plant' },
  { tokens: ['shield', 'generator'], canonical: 'Shield Generator' },
  { tokens: ['quantum', 'drive'], canonical: 'Quantum Drive' },
  { tokens: ['missile', 'rack'], canonical: 'Missile Rack' },
  { tokens: ['life', 'support'], canonical: 'Life Support' },
  { tokens: ['cargo', 'grid'], canonical: 'Cargo Grid' },
  { tokens: ['point', 'defense'], canonical: 'Point Defense' },
]

const TYPE_WORDS: Record<string, string> = {
  gun: 'Weapon',
  weapon: 'Weapon',
  cooler: 'Cooler',
  missile: 'Missile',
  shield: 'Shield',
  radar: 'Radar',
  turret: 'Turret',
  avionics: 'Avionics',
  relay: 'Relay',
  cargo: 'Cargo',
  mining: 'Mining Laser',
  salvage: 'Salvage Head',
}

// Position words, grouped into ordering buckets — output always reorders
// into bucket order regardless of the token order in the raw name (see
// "hardpoint_missilerack_left_wing_outer" -> "Left Outer Wing Missile Rack":
// raw order is left, wing, outer but the canonical label reorders to
// left, outer, wing).
const BUCKET_SIDE = ['left', 'right', 'port', 'starboard', 'center']
const BUCKET_INOUT = ['inner', 'outer']
const BUCKET_OTHER_POSITION = ['top', 'bottom', 'nose', 'rear', 'front']
const BUCKET_MOUNT = ['wing', 'turret']
const POSITION_BUCKETS = [BUCKET_SIDE, BUCKET_INOUT, BUCKET_OTHER_POSITION, BUCKET_MOUNT]
const ALL_POSITION_WORDS = new Set(POSITION_BUCKETS.flat())

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function ungluewords(input: string): string {
  return GLUED_COMPOUNDS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), input)
}

/** Reorders a set of leftover tokens into canonical bucket order, dropping
 * anything not recognized as a position word into a trailing catch-all
 * (still title-cased, never silently discarded). */
function orderPositionTokens(tokens: string[]): string[] {
  const lower = tokens.map((t) => t.toLowerCase())
  const ordered: string[] = []
  for (const bucket of POSITION_BUCKETS) {
    for (const word of bucket) {
      if (lower.includes(word)) ordered.push(titleCase(word))
    }
  }
  const unrecognized = tokens.filter((t) => !ALL_POSITION_WORDS.has(t.toLowerCase()))
  return [...ordered, ...unrecognized.map(titleCase)]
}

export interface GeneratedName {
  displayName: string
  positionLabel?: string
}

/**
 * `overrideMap` — internalName -> explicit displayName, for the awkward
 * cases token-based generation can't be expected to get right. When an
 * override exists it wins outright; `positionLabel` is still computed
 * heuristically in that case so debug tooling has something to show, but
 * `displayName` uses the override verbatim.
 */
export function generateDisplayName(internalName: string, overrideMap?: Record<string, string>): GeneratedName {
  const heuristic = generateFromTokens(internalName)
  const override = overrideMap?.[internalName]
  if (override) {
    return { displayName: override, positionLabel: heuristic.positionLabel }
  }
  return heuristic
}

function generateFromTokens(internalName: string): GeneratedName {
  const stripped = ungluewords(internalName).replace(/^hardpoint_/i, '')
  const tokens = stripped.split('_').filter(Boolean)
  if (tokens.length === 0) return { displayName: internalName }

  let canonical: string | null = null
  const consumed = new Array(tokens.length).fill(false)

  for (const phrase of TYPE_PHRASES) {
    for (let i = 0; i <= tokens.length - phrase.tokens.length; i++) {
      const slice = tokens.slice(i, i + phrase.tokens.length).map((t) => t.toLowerCase())
      if (slice.join(' ') === phrase.tokens.join(' ')) {
        canonical = phrase.canonical
        for (let j = i; j < i + phrase.tokens.length; j++) consumed[j] = true
        break
      }
    }
    if (canonical) break
  }

  if (!canonical) {
    for (let i = 0; i < tokens.length; i++) {
      const word = TYPE_WORDS[tokens[i].toLowerCase()]
      if (word) {
        canonical = word
        consumed[i] = true
        break
      }
    }
  }

  if (!canonical) {
    // Never rely only on numbering — if nothing recognized, fall back to a
    // plain, still-readable title-cased join rather than a bare number.
    return { displayName: tokens.map(titleCase).join(' ') }
  }

  const leftover = tokens.filter((_, i) => !consumed[i])

  let index: string | null = null
  if (leftover.length > 0 && /^0*\d+$/.test(leftover[leftover.length - 1])) {
    index = String(Number(leftover[leftover.length - 1]))
    leftover.pop()
  }

  const orderedPosition = orderPositionTokens(leftover)
  const positionLabel = orderedPosition.length > 0 ? orderedPosition.join(' ') : undefined
  const prefix = positionLabel ? positionLabel + ' ' : ''
  const displayName = [prefix + canonical, index].filter(Boolean).join(' ')

  return { displayName, positionLabel }
}
