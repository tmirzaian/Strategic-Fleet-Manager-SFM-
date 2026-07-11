import { basename, dirname } from 'node:path'

/**
 * Reduces an absolute `Data.p4k` path to a portable label — just the
 * parent directory name and file name (e.g. "LIVE/Data.p4k") — so the
 * generated catalog never embeds a machine-specific or username-bearing
 * absolute path.
 */
export function toPortableP4kLabel(absolutePath: string): string {
  const fileName = basename(absolutePath)
  const parentName = basename(dirname(absolutePath))
  return `${parentName}/${fileName}`
}
