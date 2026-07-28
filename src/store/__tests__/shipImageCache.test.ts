import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useShipImageCacheStore } from '../shipImageCache'
import { storeShipImage } from '../../utils/shipImageStorage'

function makeFile(name: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type: 'image/png' })
}

beforeEach(() => {
  useShipImageCacheStore.setState({ entries: {} })
})

describe('UX-005A: shipImageCache — ensureLoaded', () => {
  it('transitions loading -> ready when the blob exists', async () => {
    await storeShipImage('vessel-1', makeFile('a.png'))
    useShipImageCacheStore.getState().ensureLoaded('vessel-1', 'ships/vessel-1.png')
    expect(useShipImageCacheStore.getState().entries['vessel-1']?.status).toBe('loading')

    await vi.waitFor(() => {
      expect(useShipImageCacheStore.getState().entries['vessel-1']?.status).toBe('ready')
    })
    const entry = useShipImageCacheStore.getState().entries['vessel-1']
    expect(entry?.status).toBe('ready')
    if (entry?.status === 'ready') expect(entry.objectUrl).toMatch(/^blob:/)
  })

  it('transitions loading -> missing when no blob is stored for that vessel (Deliverable 3: never breaks)', async () => {
    useShipImageCacheStore.getState().ensureLoaded('vessel-never-stored', 'ships/vessel-never-stored.png')
    await vi.waitFor(() => {
      expect(useShipImageCacheStore.getState().entries['vessel-never-stored']?.status).toBe('missing')
    })
  })

  it('is a no-op when an entry for the same ref already exists — does not re-trigger a load', async () => {
    await storeShipImage('vessel-2', makeFile('a.png'))
    useShipImageCacheStore.getState().ensureLoaded('vessel-2', 'ships/vessel-2.png')
    await vi.waitFor(() => expect(useShipImageCacheStore.getState().entries['vessel-2']?.status).toBe('ready'))
    const firstObjectUrl = (useShipImageCacheStore.getState().entries['vessel-2'] as { objectUrl: string }).objectUrl

    useShipImageCacheStore.getState().ensureLoaded('vessel-2', 'ships/vessel-2.png')
    const entry = useShipImageCacheStore.getState().entries['vessel-2']
    expect(entry?.status).toBe('ready')
    if (entry?.status === 'ready') expect(entry.objectUrl).toBe(firstObjectUrl)
  })

  it('re-triggers a load when the ref changes (a new image was chosen for the same vessel)', async () => {
    await storeShipImage('vessel-3', makeFile('a.png'))
    useShipImageCacheStore.getState().ensureLoaded('vessel-3', 'ships/vessel-3.png')
    await vi.waitFor(() => expect(useShipImageCacheStore.getState().entries['vessel-3']?.status).toBe('ready'))

    useShipImageCacheStore.getState().ensureLoaded('vessel-3', 'ships/vessel-3.jpg')
    expect(useShipImageCacheStore.getState().entries['vessel-3']?.status).toBe('loading')
    expect(useShipImageCacheStore.getState().entries['vessel-3']?.ref).toBe('ships/vessel-3.jpg')
  })
})

describe('UX-005A: shipImageCache — invalidate', () => {
  it('revokes the cached object URL and clears the entry entirely', async () => {
    await storeShipImage('vessel-4', makeFile('a.png'))
    useShipImageCacheStore.getState().ensureLoaded('vessel-4', 'ships/vessel-4.png')
    await vi.waitFor(() => expect(useShipImageCacheStore.getState().entries['vessel-4']?.status).toBe('ready'))

    useShipImageCacheStore.getState().invalidate('vessel-4')
    expect(URL.revokeObjectURL).toHaveBeenCalled()
    expect(useShipImageCacheStore.getState().entries['vessel-4']).toBeUndefined()
  })

  it('invalidating a vessel with no cache entry at all is a safe no-op', () => {
    expect(() => useShipImageCacheStore.getState().invalidate('never-cached')).not.toThrow()
  })
})
