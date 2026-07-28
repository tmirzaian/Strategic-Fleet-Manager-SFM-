/**
 * RC-001 (Phase 3) — Pre-Rehearsal Data Preservation snapshot tool.
 *
 * This is deliberately NOT part of the built application (no route, no
 * bundle entry). SFM is a pure browser SPA — its real fleet data lives in
 * whatever browser storage *origin* (protocol + hostname + port) the
 * Commander's existing tab is actually pointed at, and that origin is not
 * something this repo can know or reach in advance. The only reliable way
 * to preserve it is a script that runs INSIDE that same tab, in that same
 * origin's own JS context, so it automatically reads the correct
 * `localStorage` and IndexedDB without anyone having to guess a host/port.
 *
 * USAGE
 *   1. Open the Commander's real, currently-in-use SFM tab (the one with
 *      the real fleet — do NOT open a fresh RC1 tab for this step).
 *   2. Open DevTools (F12) -> Console tab.
 *   3. Paste this entire file's contents and press Enter (defines
 *      `exportFleetSnapshot` on `window`, does not run automatically).
 *   4. Run:  exportFleetSnapshot()
 *   5. The browser downloads one JSON file:
 *        sfm-fleet-snapshot-<hostname>-<port>-<ISO-timestamp>.json
 *      Move it outside the browser profile (e.g. a dated folder on disk)
 *      immediately — per RC-001 Phase 3, the snapshot must be stored
 *      outside active browser storage and left unchanged during testing.
 *
 * The snapshot captures BOTH storage layers SFM actually uses:
 *   - localStorage['sfm-fleet-store']   (core fleet state, Zustand persist)
 *   - IndexedDB 'sfm-ship-images' / object store 'images'
 *     (UX-005A managed custom ship images, keyed by vessel id, each
 *     record an ArrayBuffer + MIME type)
 * A copy of localStorage alone is NOT a complete backup — the images
 * live in IndexedDB and are excluded from the core JSON entirely by
 * design (see src/utils/shipImageStorage.ts).
 *
 * This script only reads. It never writes or clears anything. See
 * importFleetSnapshot.js for the paired restore/rollback tool.
 */
;(function () {
  const LOCAL_STORAGE_KEY = 'sfm-fleet-store'
  const IDB_NAME = 'sfm-ship-images'
  const IDB_STORE = 'images'

  function bufferToBase64(buffer) {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
    }
    return btoa(binary)
  }

  function openImageDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null) // No IndexedDB support/data in this context — reported, not fatal.
        return
      }
      const request = indexedDB.open(IDB_NAME)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Failed to open ' + IDB_NAME))
      request.onupgradeneeded = () => {
        // A fresh/never-used DB has no data to export — do not create it.
        request.transaction.abort()
      }
    })
  }

  function readAllImageRecords(db) {
    return new Promise((resolve, reject) => {
      if (!db || !db.objectStoreNames.contains(IDB_STORE)) {
        resolve([])
        return
      }
      const tx = db.transaction(IDB_STORE, 'readonly')
      const store = tx.objectStore(IDB_STORE)
      const keysReq = store.getAllKeys()
      const valuesReq = store.getAll()
      tx.oncomplete = () => {
        const keys = keysReq.result || []
        const values = valuesReq.result || []
        resolve(keys.map((key, i) => ({ key, record: values[i] })))
      }
      tx.onerror = () => reject(tx.error || new Error('Failed to read ' + IDB_STORE))
    })
  }

  async function exportFleetSnapshot() {
    const startedAt = new Date()
    const rawLocalStorage = localStorage.getItem(LOCAL_STORAGE_KEY)
    let persistVersion = null
    if (rawLocalStorage) {
      try {
        persistVersion = JSON.parse(rawLocalStorage).version ?? null
      } catch (e) {
        console.warn('[exportFleetSnapshot] Could not parse localStorage JSON to read version:', e)
      }
    }

    const db = await openImageDb().catch((err) => {
      console.warn('[exportFleetSnapshot] IndexedDB open failed, proceeding with 0 images:', err)
      return null
    })
    const entries = await readAllImageRecords(db)
    if (db) db.close()

    const images = entries.map(({ key, record }) => {
      if (!record || !record.buffer) {
        return { vesselId: key, type: record ? record.type : null, base64: null, byteLength: 0, note: 'unreadable/empty record' }
      }
      return {
        vesselId: key,
        type: record.type,
        base64: bufferToBase64(record.buffer),
        byteLength: record.buffer.byteLength,
      }
    })

    const totalImageBytes = images.reduce((sum, r) => sum + (r.byteLength || 0), 0)
    const localStorageBytes = rawLocalStorage ? new Blob([rawLocalStorage]).size : 0

    const snapshot = {
      snapshotFormatVersion: 1,
      capturedAt: startedAt.toISOString(),
      sourceOrigin: {
        href: location.href,
        origin: location.origin,
        protocol: location.protocol,
        hostname: location.hostname,
        port: location.port || (location.protocol === 'https:' ? '443' : '80'),
        pathname: location.pathname,
      },
      coreFleetState: {
        localStorageKey: LOCAL_STORAGE_KEY,
        present: rawLocalStorage !== null,
        persistVersion,
        byteSize: localStorageBytes,
        raw: rawLocalStorage,
      },
      managedShipImages: {
        indexedDbName: IDB_NAME,
        objectStoreName: IDB_STORE,
        recordCount: images.length,
        totalByteSize: totalImageBytes,
        records: images,
      },
    }

    const json = JSON.stringify(snapshot, null, 2)
    const safeHost = (location.hostname || 'unknown-host') + (location.port ? '-' + location.port : '')
    const filename = 'sfm-fleet-snapshot-' + safeHost + '-' + startedAt.toISOString().replace(/[:.]/g, '-') + '.json'

    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    console.log(
      '%c[exportFleetSnapshot] Snapshot written: ' + filename,
      'color: #2dd4bf; font-weight: bold;'
    )
    console.table({
      'Source origin': snapshot.sourceOrigin.href,
      'localStorage present': snapshot.coreFleetState.present,
      'Persist version': snapshot.coreFleetState.persistVersion,
      'localStorage bytes': snapshot.coreFleetState.byteSize,
      'Image records': snapshot.managedShipImages.recordCount,
      'Image bytes (approx, pre-base64)': snapshot.managedShipImages.totalByteSize,
    })
    console.log(
      'Move the downloaded file out of your Downloads folder into a dated, ' +
        'clearly-labeled release-snapshot location before doing anything else. ' +
        'Do not clear browser storage or uninstall the current instance until ' +
        'you have confirmed this file downloaded successfully.'
    )

    return snapshot
  }

  window.exportFleetSnapshot = exportFleetSnapshot
  console.log(
    '%c[RC-001] exportFleetSnapshot() is ready. Run it now to capture this ' +
      'tab\'s real fleet data before opening any RC1 build.',
    'color: #38bdf8; font-weight: bold;'
  )
})()
