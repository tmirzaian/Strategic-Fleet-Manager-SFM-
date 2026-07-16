/**
 * Deterministic localization-key resolution (Mission M-012).
 *
 * Every DataCore localization key SFM sees is a `@`-prefixed reference
 * (e.g. `@vehicle_NameAEGS_Avenger_Titan`, `@item_NameAEGS_Gladius_CML_Flare`)
 * into Star Citizen's own English string table, shipped inside the P4K at
 * `Data/Localization/english/global.ini` — a `key=value` (UTF-8 BOM, CRLF)
 * file. Stripping the leading `@` and looking the key up in that file is
 * the authoritative, deterministic resolution path; nothing is guessed or
 * templated from the entity/localization key text itself.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

export const GLOBAL_INI_P4K_PATH = 'Data/Localization/english/global.ini'

/** Extracts Data/Localization/english/global.ini from the P4K via `p4k extract`, if not already present at `destDir`. */
export function extractGlobalIni(starbreakerExePath: string, dataP4kPath: string, destDir: string): string {
  const destPath = join(destDir, 'Data', 'Localization', 'english', 'global.ini')
  if (existsSync(destPath)) return destPath

  mkdirSync(destDir, { recursive: true })
  const result = spawnSync(starbreakerExePath, ['p4k', 'extract', '--p4k', dataP4kPath, '-o', destDir, '--filter', GLOBAL_INI_P4K_PATH], {
    encoding: 'utf-8',
  })
  if (result.error) {
    throw new Error(`Failed to execute StarBreaker at "${starbreakerExePath}": ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`StarBreaker p4k extract failed for "${GLOBAL_INI_P4K_PATH}" (exit code ${result.status}): ${(result.stderr ?? '').trim()}`)
  }
  if (!existsSync(destPath)) {
    throw new Error(`StarBreaker p4k extract reported success but "${destPath}" was not created.`)
  }
  return destPath
}

/**
 * Parses a `key=value` global.ini into a Map. Only the first `=` on each
 * line is treated as the separator (localized strings frequently contain
 * `=` themselves); a leading UTF-8 BOM and CRLF line endings are stripped.
 * Lines with no `=` or that are empty are skipped (not every line in this
 * file is a translation entry).
 */
export function parseGlobalIni(contents: string): Map<string, string> {
  const map = new Map<string, string>()
  const withoutBom = contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents
  for (const rawLine of withoutBom.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq)
    const value = line.slice(eq + 1)
    if (!key) continue
    map.set(key, value)
  }
  return map
}

export async function loadLocalizationTable(globalIniPath: string): Promise<Map<string, string>> {
  const contents = await readFile(globalIniPath, 'utf-8')
  return parseGlobalIni(contents)
}

/**
 * Resolves a DataCore localization key (`@key`, or bare `key`) to its
 * English display string. Returns null — never a guessed/templated
 * fallback — when the key is missing, empty, a known placeholder
 * (`@LOC_PLACEHOLDER`, `@LOC_UNINITIALIZED`, `@LOC_EMPTY`), or absent from
 * the table (Mission M-012 test requirement: "explicit null behavior").
 */
const PLACEHOLDER_KEYS = new Set(['LOC_PLACEHOLDER', 'LOC_UNINITIALIZED', 'LOC_EMPTY'])

export function resolveLocalizedName(localizationKey: string | null | undefined, table: Map<string, string>): string | null {
  if (!localizationKey) return null
  const bareKey = localizationKey.startsWith('@') ? localizationKey.slice(1) : localizationKey
  if (!bareKey || PLACEHOLDER_KEYS.has(bareKey)) return null
  const value = table.get(bareKey)
  return value && value.length > 0 ? value : null
}
