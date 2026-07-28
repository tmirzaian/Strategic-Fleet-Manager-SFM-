/**
 * RC-001 (Phase 9) — Rollback / restore tool, paired with
 * exportFleetSnapshot.js. Writes a previously-captured snapshot JSON
 * file back into the CURRENT tab's origin: localStorage['sfm-fleet-store']
 * and IndexedDB 'sfm-ship-images' / 'images'. Restores both storage
 * layers together — a restore that writes only the core JSON and skips
 * the image blobs is incomplete (see exportFleetSnapshot.js header).
 *
 * USAGE (rollback to the pre-RC state)
 *   1. Open the ORIGIN you want to restore into (this must be the same
 *      origin the snapshot was captured from — see the snapshot's own
 *      `sourceOrigin` field; restoring into a different origin does not
 *      "move" data, it just writes a copy into whatever origin is open).
 *   2. Open DevTools (F12) -> Console tab.
 *   3. Paste this entire file's contents and press Enter (defines
 *      `importFleetSnapshot` on `window`, does not run automatically).
 *   4. Run:  importFleetSnapshot()
 *      A native file picker opens — choose the exact snapshot JSON file
 *      produced by exportFleetSnapshot.js.
 *   5. When it reports success, reload the page. Do not reload before
 *      the console confirms the write completed.
 *
 * This is a destructive write to whatever origin is currently open: it
 * OVERWRITES the existing 'sfm-fleet-store' localStorage entry and
 * REPLACES the entire IndexedDB 'images' object store with the
 * snapshot's contents. Confirm you are on the intended origin (check
 * `location.href` first) before running it.
 */
;(function () {
  const LOCAL_STORAGE_KEY = 'sfm-fleet-store'
  const IDB_NAME = 'sfm-ship-images'
  const IDB_STORE = 'images'

  function base64ToBuffer(base64) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
  }

  function pickSnapshotFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json,.json'
      input.style.position = 'fixed'
      input.style.top = '-1000px'
      input.onchange = () => {
        const file = input.files && input.files[0]
        document.body.removeChild(input)
        if (!file) {
          reject(new Error('No file selected.'))
          return
        }
        resolve(file)
      }
      document.body.appendChild(input)
      input.click()
    })
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error || new Error('Failed to read file.'))
      reader.readAsText(file)
    })
  }

  function openImageDbForWrite() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Failed to open ' + IDB_NAME))
    })
  }

  function replaceAllImageRecords(db, records) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const store = tx.objectStore(IDB_STORE)
      store.clear()
      for (const { vesselId, type, base64 } of records) {
        if (!base64) continue // skip unreadable/empty entries captured at export time
        store.put({ buffer: base64ToBuffer(base64), type }, vesselId)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error || new Error('Failed to write ' + IDB_STORE))
    })
  }

  async function importFleetSnapshot() {
    console.log(
      '%c[importFleetSnapshot] Restoring into: ' + location.href,
      'color: #f59e0b; font-weight: bold;'
    )
    const file = await pickSnapshotFile()
    const text = await readFileAsText(file)
    const snapshot = JSON.parse(text)

    if (!snapshot || snapshot.snapshotFormatVersion !== 1) {
      throw new Error('Unrecognized snapshot file — expected snapshotFormatVersion 1.')
    }

    console.table({
      'Snapshot captured at': snapshot.capturedAt,
      'Snapshot source origin': snapshot.sourceOrigin && snapshot.sourceOrigin.href,
      'Restoring into': location.href,
      'Persist version in snapshot': snapshot.coreFleetState.persistVersion,
      'Image records in snapshot': snapshot.managedShipImages.recordCount,
    })

    if (snapshot.sourceOrigin && snapshot.sourceOrigin.origin !== location.origin) {
      console.warn(
        '[importFleetSnapshot] WARNING: this snapshot was captured from a ' +
          'different origin (' + snapshot.sourceOrigin.origin + ') than the ' +
          'one you are restoring into (' + location.origin + '). Proceeding ' +
          'anyway — confirm this is intentional.'
      )
    }

    if (snapshot.coreFleetState.present && typeof snapshot.coreFleetState.raw === 'string') {
      localStorage.setItem(LOCAL_STORAGE_KEY, snapshot.coreFleetState.raw)
    } else {
      console.warn('[importFleetSnapshot] Snapshot had no core fleet state — leaving localStorage untouched.')
    }

    const db = await openImageDbForWrite()
    await replaceAllImageRecords(db, snapshot.managedShipImages.records || [])
    db.close()

    console.log(
      '%c[importFleetSnapshot] Restore complete: ' +
        (snapshot.coreFleetState.present ? '1 core state record' : '0 core state records') +
        ', ' + (snapshot.managedShipImages.records || []).length + ' image record(s) written. ' +
        'Reload the page now to verify.',
      'color: #22c55e; font-weight: bold;'
    )

    return snapshot
  }

  window.importFleetSnapshot = importFleetSnapshot
  console.log(
    '%c[RC-001] importFleetSnapshot() is ready. Confirm location.href is the ' +
      'correct origin before running it — this overwrites existing data here.',
    'color: #38bdf8; font-weight: bold;'
  )
})()
