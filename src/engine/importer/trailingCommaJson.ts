/**
 * Strips trailing commas before `]` or `}` from otherwise-valid-JSON text,
 * tracking string/escape state so commas inside string values are never
 * touched. Some StarBreaker `--dump-hierarchy` builds emit a trailing
 * comma after the final element of every array/object they write — this
 * makes the output invalid strict JSON while remaining structurally sound
 * (JSON5-legal). Used only as a fallback when strict JSON.parse fails, so
 * exports that already parse cleanly are never touched by this pass.
 */
export function stripTrailingCommas(text: string): string {
  let result = ''
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      result += ch
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
      result += ch
      continue
    }

    if (ch === ',') {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j++
      if (text[j] === ']' || text[j] === '}') {
        continue
      }
    }

    result += ch
  }

  return result
}
