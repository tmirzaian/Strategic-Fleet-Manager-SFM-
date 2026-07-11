/**
 * Rule-based display name generation for hardpoint-style internal names
 * (e.g. "hardpoint_gun_left_wing"). This is genuine normalization logic —
 * distinct from `resolveDisplayName`'s crude word-by-word fallback — used
 * by the Gladius normalizer (and any future ship normalizer) to turn CIG's
 * internal port names into names the UI is allowed to show.
 *
 * Examples this produces:
 *   hardpoint_gun_left_wing        -> "Left Wing Weapon"
 *   hardpoint_gun_right_wing       -> "Right Wing Weapon"
 *   hardpoint_power_plant          -> "Power Plant"
 *   hardpoint_quantum_drive        -> "Quantum Drive"
 *   hardpoint_shield_generator_left -> "Left Shield Generator"
 *   hardpoint_cooler               -> "Cooler"
 *   hardpoint_missile_rack         -> "Missile Rack"
 *   hardpoint_missile_rack_01      -> "Missile Rack 1"
 */

/** Multi-token type phrases, checked before single-token ones (longest match first). */
const TYPE_PHRASES: Array<{ tokens: string[]; canonical: string }> = [
  { tokens: ['power', 'plant'], canonical: 'Power Plant' },
  { tokens: ['shield', 'generator'], canonical: 'Shield Generator' },
  { tokens: ['quantum', 'drive'], canonical: 'Quantum Drive' },
  { tokens: ['missile', 'rack'], canonical: 'Missile Rack' },
]

/** Single-token type words. */
const TYPE_WORDS: Record<string, string> = {
  gun: 'Weapon',
  weapon: 'Weapon',
  cooler: 'Cooler',
  missile: 'Missile',
  shield: 'Shield',
  radar: 'Radar',
  turret: 'Turret',
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

export function generateHardpointDisplayName(internalName: string): string {
  const stripped = internalName.replace(/^hardpoint_/i, '')
  const tokens = stripped.split('_').filter(Boolean)
  if (tokens.length === 0) return internalName

  let canonical: string | null = null
  const consumed = new Array(tokens.length).fill(false)

  // Longest-match first: multi-token phrases before single-token words.
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

  // Nothing recognized — fall back to a plain title-cased join.
  if (!canonical) {
    return tokens.map(titleCase).join(' ')
  }

  const leftover = tokens.filter((_, i) => !consumed[i])

  // A trailing purely-numeric leftover token becomes a suffix index
  // ("Missile Rack 1"), matching the "Weapon 1" / "Cooler 2" style the
  // rest of the app already uses for numbered slots.
  let index: string | null = null
  if (leftover.length > 0 && /^0*\d+$/.test(leftover[leftover.length - 1])) {
    index = String(Number(leftover[leftover.length - 1]))
    leftover.pop()
  }

  const prefix = leftover.map(titleCase).join(' ')

  return [prefix, canonical, index].filter(Boolean).join(' ')
}
