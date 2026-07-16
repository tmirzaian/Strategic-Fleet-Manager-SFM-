/**
 * Pure helper for resolving a relative asset key into a root-relative
 * public URL under /assets/. Deliberately not a filesystem abstraction —
 * it does string normalization only, never touches disk (browser-safe,
 * no Node modules).
 */
const ASSETS_ROOT = '/assets/'

/**
 * Resolves a path relative to `public/assets/` (e.g.
 * `"environments/mission-control/background.webp"`) into a root-relative
 * public URL (`"/assets/environments/mission-control/background.webp"`).
 *
 * - Normalizes backslashes and repeated slashes to a single forward slash.
 * - Strips leading/trailing slashes from the input before joining, so
 *   both `"foo/bar.png"` and `"/foo/bar.png"` produce the same result.
 * - Rejects path traversal (`..` segments) and absolute/remote inputs
 *   (a leading `/`, a `//` protocol-relative URL, or any `scheme://`) by
 *   throwing — this helper is for local production assets only, never
 *   for accepting an arbitrary remote URL.
 */
export function assetPath(relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    throw new Error('assetPath: relativePath must be a non-empty string.')
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(relativePath) || relativePath.startsWith('//')) {
    throw new Error(`assetPath: remote URLs are not allowed ("${relativePath}").`)
  }

  // Normalize backslashes (Windows-authored paths) and collapse repeated slashes.
  const normalized = relativePath.replace(/\\/g, '/').replace(/\/+/g, '/')

  const segments = normalized.split('/').filter((segment) => segment !== '' && segment !== '.')

  if (segments.some((segment) => segment === '..')) {
    throw new Error(`assetPath: path traversal is not allowed ("${relativePath}").`)
  }

  if (segments.length === 0) {
    throw new Error(`assetPath: relativePath resolved to an empty path ("${relativePath}").`)
  }

  return ASSETS_ROOT + segments.join('/')
}
