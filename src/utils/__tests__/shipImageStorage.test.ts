import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  validateShipImageFile,
  storeShipImage,
  getShipImageBlob,
  deleteShipImage,
  customImageRefFor,
  MAX_IMAGE_BYTES,
} from '../shipImageStorage'

// jsdom has no createImageBitmap — stub it as "any well-formed image
// decodes fine" so validation tests exercise type/size checks for real
// and only the decode step is faked (the fake-indexeddb polyfill in
// vitest.setup.ts already makes the actual storage layer real, not mocked).
beforeEach(() => {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (file: File) => {
      if (file.name.includes('corrupt')) throw new Error('bad image data')
      return { close: () => {} } as unknown as ImageBitmap
    })
  )
})

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe('UX-005A: shipImageStorage — validateShipImageFile', () => {
  it('accepts a well-formed PNG/JPG/WebP file', async () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      const result = await validateShipImageFile(makeFile('livery.png', type))
      expect(result).toEqual({ valid: true })
    }
  })

  it('rejects an unsupported file type with a clear inline message', async () => {
    const result = await validateShipImageFile(makeFile('notes.txt', 'text/plain'))
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/unsupported/i)
  })

  it('rejects an empty file', async () => {
    const result = await validateShipImageFile(makeFile('empty.png', 'image/png', 0))
    expect(result.valid).toBe(false)
  })

  it('rejects a file over the size cap', async () => {
    const result = await validateShipImageFile(makeFile('huge.png', 'image/png', MAX_IMAGE_BYTES + 1))
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/too large/i)
  })

  it('rejects a file the browser cannot decode as an image, even with an image/* MIME type', async () => {
    const result = await validateShipImageFile(makeFile('corrupt.png', 'image/png'))
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/read/i)
  })
})

describe('UX-005A: shipImageStorage — customImageRefFor', () => {
  it('formats a relative managed reference from the vessel id and file type — never an absolute path', () => {
    expect(customImageRefFor('ghost-asset-1', makeFile('x.png', 'image/png'))).toBe('ships/ghost-asset-1.png')
    expect(customImageRefFor('ghost-asset-2', makeFile('x.jpg', 'image/jpeg'))).toBe('ships/ghost-asset-2.jpg')
    expect(customImageRefFor('ghost-asset-3', makeFile('x.webp', 'image/webp'))).toBe('ships/ghost-asset-3.webp')
  })
})

describe('UX-005A: shipImageStorage — IndexedDB round-trip', () => {
  it('stores and retrieves a blob keyed by vessel id', async () => {
    const file = makeFile('black-livery.png', 'image/png', 2048)
    const { ref } = await storeShipImage('vessel-a', file)
    expect(ref).toBe('ships/vessel-a.png')

    const blob = await getShipImageBlob('vessel-a')
    expect(blob).toBeDefined()
    expect(blob!.size).toBe(2048)
  })

  it('returns undefined for a vessel with no stored image — never throws', async () => {
    const blob = await getShipImageBlob('never-stored')
    expect(blob).toBeUndefined()
  })

  it('two vessels store fully independent blobs, even with otherwise identical file content', async () => {
    const fileA = makeFile('livery.png', 'image/png', 100)
    const fileB = makeFile('livery.png', 'image/png', 100)
    await storeShipImage('ghost-a', fileA)
    await storeShipImage('ghost-b', fileB)

    await deleteShipImage('ghost-a')

    expect(await getShipImageBlob('ghost-a')).toBeUndefined()
    expect(await getShipImageBlob('ghost-b')).toBeDefined()
  })

  it('deleteShipImage on a vessel with nothing stored is a safe no-op', async () => {
    await expect(deleteShipImage('nothing-here')).resolves.toBeUndefined()
  })

  it('storing a new image for the same vessel replaces the previous one', async () => {
    await storeShipImage('vessel-replace', makeFile('a.png', 'image/png', 10))
    await storeShipImage('vessel-replace', makeFile('b.png', 'image/png', 999))
    const blob = await getShipImageBlob('vessel-replace')
    expect(blob!.size).toBe(999)
  })
})
