/**
 * UX-005A (Deliverable 2) — "Application-Managed Storage" translated for
 * this app's actual runtime: Strategic Fleet Manager is a pure browser
 * SPA (Vite/React/Zustand, no Electron, no backend server, no Node
 * filesystem access at runtime) — there is no `<SFM data>/images/ships/`
 * directory a web page can write to. IndexedDB is the direct browser
 * equivalent of "application-managed storage": a large-quota (typically
 * hundreds of MB+, vs. localStorage's ~5-10MB), origin-scoped store that
 * accepts raw `Blob`s natively (no base64 encoding needed), kept entirely
 * separate from the small, frequently-rewritten `localStorage` blob the
 * core Zustand state persists through — satisfying the Engineering
 * Constraint "No base64 image blobs in core JSON/state" exactly, and the
 * Deliverable 2 requirement that only a *relative managed reference*
 * (never the bytes, never an absolute path) lives in persisted fleet
 * data (`FleetAsset.customImageRef` — see src/types/index.ts).
 *
 * One object store, `images`, keyed directly by vessel instance id
 * (`FleetAsset.id` / `Ship.id` — the two are the same value, see
 * fleetAssetMaterializer.ts). The `customImageRef` string persisted in
 * fleet data (`ships/<vessel-id>.<ext>`) is informational/portable —
 * matching the directory shape the work order describes — but actual
 * lookup always keys by vessel id directly, never by parsing the ref
 * string, so a malformed or stale ref can never cause a lookup error.
 *
 * WebP standardization (Deliverable 2's "Engineering may standardize
 * imported images to WebP if a safe existing image-processing path is
 * available") is deliberately deferred — `sharp` (already a
 * devDependency) is a Node-only native addon and cannot run in the
 * browser at the point a Commander selects a file; a browser-side
 * Canvas-to-WebP conversion is a real option but adds real risk (quality
 * loss, decode/encode edge cases) for a Beta 2.0 sprint that explicitly
 * permits deferring it ("Otherwise preserve approved common formats...
 * and defer conversion"). Files are stored exactly as selected.
 */

const DB_NAME = 'sfm-ship-images'
const DB_VERSION = 1
const STORE_NAME = 'images'

/** Recommended supported input formats (Deliverable 4). */
export const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number]

/** A generous-but-sane cap, not explicitly specified by the work order —
 * IndexedDB has no hard per-item limit worth relying on, but an
 * unbounded accept invites a multi-minute write for an accidentally-
 * selected RAW/uncompressed photo. Chosen judgment call, documented here
 * rather than silently applied. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function extensionForType(type: string): string {
  switch (type) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    default:
      return 'bin'
  }
}

export interface ShipImageValidation {
  valid: boolean
  /** Present only when `valid` is false — a clear, Commander-facing inline message (Deliverable 4). */
  reason?: string
}

/**
 * Validates a Commander-selected file before it's ever written to
 * managed storage. Checks the declared MIME type, a size ceiling, and
 * (via `createImageBitmap`) that the browser can actually decode it —
 * catching a renamed non-image file or a corrupt image, not just a bad
 * extension. Never throws; a decode failure is reported the same as any
 * other validation failure.
 */
export async function validateShipImageFile(file: File): Promise<ShipImageValidation> {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type as SupportedImageType)) {
    return { valid: false, reason: 'Unsupported file type. Choose a PNG, JPG, or WebP image.' }
  }
  if (file.size === 0) {
    return { valid: false, reason: 'That file is empty.' }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { valid: false, reason: `That file is too large (max ${Math.floor(MAX_IMAGE_BYTES / (1024 * 1024))} MB).` }
  }
  try {
    const bitmap = await createImageBitmap(file)
    bitmap.close()
  } catch {
    return { valid: false, reason: "That file couldn't be read as an image." }
  }
  return { valid: true }
}

/** The relative managed reference persisted in fleet data — informational
 * only (see this file's own doc comment); never parsed back into a key. */
export function customImageRefFor(vesselId: string, file: File): string {
  return `ships/${vesselId}.${extensionForType(file.type)}`
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open ship-image storage.'))
  })
}

/** What's actually persisted per vessel — an `ArrayBuffer` plus its MIME
 * type, not a raw `Blob`/`File`. `ArrayBuffer` structured-clones
 * reliably everywhere IndexedDB is implemented; `Blob`/`File` storage
 * support has historically been inconsistent across engines (and, in
 * this project's own test environment — jsdom + fake-indexeddb — a
 * stored `File` comes back as an empty plain object, not a `Blob`,
 * confirmed by direct inspection). Converting at the storage boundary
 * keeps the public API (`storeShipImage`/`getShipImageBlob`) working in
 * terms of `File`/`Blob`, matching what `<input type="file">` and
 * `URL.createObjectURL` both actually deal in. */
interface StoredShipImageRecord {
  buffer: ArrayBuffer
  type: string
}

/** Copies a validated file into managed storage, keyed by vessel id.
 * Throws on failure — callers (the Settings UI) are expected to catch
 * this and show an inline message; this is the one write path where a
 * failure should be surfaced, not silently absorbed. */
export async function storeShipImage(vesselId: string, file: File): Promise<{ ref: string }> {
  const buffer = await file.arrayBuffer()
  const record: StoredShipImageRecord = { buffer, type: file.type }
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(record, vesselId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Failed to save the image.'))
  })
  db.close()
  return { ref: customImageRefFor(vesselId, file) }
}

/** Reads the stored blob for a vessel, or `undefined` if none exists or
 * anything goes wrong opening/reading the store. Never throws — this is
 * the passive read path the shared resolver depends on (Deliverable 3:
 * "Missing or invalid custom files must never break a page"). */
export async function getShipImageBlob(vesselId: string): Promise<Blob | undefined> {
  try {
    const db = await openDatabase()
    const record = await new Promise<StoredShipImageRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(vesselId)
      request.onsuccess = () => resolve((request.result as StoredShipImageRecord | undefined) ?? undefined)
      request.onerror = () => reject(request.error ?? new Error('Failed to read the image.'))
    })
    db.close()
    if (!record || !record.buffer) return undefined
    return new Blob([record.buffer], { type: record.type })
  } catch {
    return undefined
  }
}

/** Deletes a vessel's managed image, if any. Best-effort/never throws —
 * used both by "Restore Default" and by fleet-asset deletion cleanup
 * (Deliverable 6), neither of which should ever fail the action it's
 * attached to over a storage-layer problem. */
export async function deleteShipImage(vesselId: string): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(vesselId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch {
    // Storage unavailable or already gone — nothing further to do.
  }
}
