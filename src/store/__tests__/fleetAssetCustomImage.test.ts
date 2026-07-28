import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'
import { useShipImageCacheStore } from '../shipImageCache'
import { storeShipImage, getShipImageBlob } from '../../utils/shipImageStorage'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => localStorage.clear())

function makeFile(name: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type: 'image/png' })
}

describe('UX-005A: updateFleetAssetCustomImage — manual (non-seed) asset', () => {
  it('sets a custom image reference on this exact FleetAsset only', () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const added = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    const result = useFleetStore.getState().updateFleetAssetCustomImage(added.assetId!, `ships/${added.assetId}.png`)
    expect(result.success).toBe(true)
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === added.assetId)!
    expect(asset.customImageRef).toBe(`ships/${added.assetId}.png`)
  })

  it('clearing (Restore Default) sets it back to undefined', () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const added = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    useFleetStore.getState().updateFleetAssetCustomImage(added.assetId!, `ships/${added.assetId}.png`)
    useFleetStore.getState().updateFleetAssetCustomImage(added.assetId!, undefined)
    const asset = useFleetStore.getState().fleetAssets.find((a) => a.id === added.assetId)!
    expect(asset.customImageRef).toBeUndefined()
  })

  it('fails cleanly for an unknown asset id', () => {
    const result = useFleetStore.getState().updateFleetAssetCustomImage('not-a-real-id', 'ships/x.png')
    expect(result.success).toBe(false)
  })

  it('Deliverable 5: two FleetAssets of the same model have fully independent customImageRef values', () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const a = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Gladius A')
    const b = useFleetStore.getState().addFleetAsset(def.id, 'OWNED', 'Gladius B')
    useFleetStore.getState().updateFleetAssetCustomImage(a.assetId!, `ships/${a.assetId}.png`)

    const assetA = useFleetStore.getState().fleetAssets.find((x) => x.id === a.assetId)!
    const assetB = useFleetStore.getState().fleetAssets.find((x) => x.id === b.assetId)!
    expect(assetA.customImageRef).toBe(`ships/${a.assetId}.png`)
    expect(assetB.customImageRef).toBeUndefined()
  })
})

describe('UX-005A: updateFleetAssetCustomImage — seed-migrated asset (Ghost)', () => {
  it('records the change in seedAssetOverrides, keyed by the asset id (not the plain ship id)', () => {
    const seedAssetId = useFleetStore.getState().fleetAssets.find((a) => a.shipDefinitionId === 'ghost')!.id
    const result = useFleetStore.getState().updateFleetAssetCustomImage('ghost', `ships/${seedAssetId}.png`)
    expect(result.success).toBe(true)
    expect(useFleetStore.getState().seedAssetOverrides[seedAssetId]?.customImageRef).toBe(`ships/${seedAssetId}.png`)
    expect(useFleetStore.getState().fleetAssets.find((a) => a.id === seedAssetId)?.customImageRef).toBe(`ships/${seedAssetId}.png`)
  })
})

describe('SW-015C (Deliverable 5): retireFleetAsset preserves the managed image — never deletes it', () => {
  it('the IndexedDB blob and the customImageRef both survive retirement', async () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const added = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    const vesselId = added.assetId!
    await storeShipImage(vesselId, makeFile('a.png'))
    useFleetStore.getState().updateFleetAssetCustomImage(vesselId, `ships/${vesselId}.png`)
    expect(await getShipImageBlob(vesselId)).toBeDefined()

    const result = useFleetStore.getState().retireFleetAsset(vesselId)
    expect(result.success).toBe(true)

    expect(await getShipImageBlob(vesselId)).toBeDefined()
    expect(useFleetStore.getState().fleetAssets.find((a) => a.id === vesselId)?.customImageRef).toBe(`ships/${vesselId}.png`)
  })

  it('retiring a vessel with no custom image does not throw', () => {
    const def = useFleetStore.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const added = useFleetStore.getState().addFleetAsset(def.id, 'OWNED')
    expect(() => useFleetStore.getState().retireFleetAsset(added.assetId!)).not.toThrow()
  })
})

describe('UX-005A (Deliverable 6): persistence — survives a genuine store reload', () => {
  it('a manual asset\'s customImageRef round-trips through localStorage', async () => {
    const { useFleetStore: store } = await import('../useFleetStore')
    const def = store.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const added = store.getState().addFleetAsset(def.id, 'OWNED')
    store.getState().updateFleetAssetCustomImage(added.assetId!, `ships/${added.assetId}.png`)

    const raw = localStorage.getItem('sfm-fleet-store')
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw!)
    expect(persisted.state.fleetAssets.find((a: { id: string }) => a.id === added.assetId)?.customImageRef).toBe(`ships/${added.assetId}.png`)

    const { vi: vitest } = await import('vitest')
    vitest.resetModules()
    const { useFleetStore: reloadedStore } = await import('../useFleetStore')
    const reloadedAsset = reloadedStore.getState().fleetAssets.find((a) => a.id === added.assetId)
    expect(reloadedAsset?.customImageRef).toBe(`ships/${added.assetId}.png`)
  })

  it('a seed ship\'s customImageRef survives via seedAssetOverrides, applied back onto the fresh seed bake-in', async () => {
    const { useFleetStore: store } = await import('../useFleetStore')
    const seedAssetId = store.getState().fleetAssets.find((a) => a.shipDefinitionId === 'ghost')!.id
    store.getState().updateFleetAssetCustomImage('ghost', `ships/${seedAssetId}.png`)

    const { vi: vitest } = await import('vitest')
    vitest.resetModules()
    const { useFleetStore: reloadedStore } = await import('../useFleetStore')
    const reloadedAsset = reloadedStore.getState().fleetAssets.find((a) => a.shipDefinitionId === 'ghost')
    expect(reloadedAsset?.customImageRef).toBe(`ships/${seedAssetId}.png`)
  })

  it('Restore Default (explicit undefined) survives a reload too — the seed baseline never silently reintroduces the old ref', async () => {
    const { useFleetStore: store } = await import('../useFleetStore')
    const seedAssetId = store.getState().fleetAssets.find((a) => a.shipDefinitionId === 'ghost')!.id
    store.getState().updateFleetAssetCustomImage('ghost', `ships/${seedAssetId}.png`)
    store.getState().updateFleetAssetCustomImage('ghost', undefined)

    const { vi: vitest } = await import('vitest')
    vitest.resetModules()
    const { useFleetStore: reloadedStore } = await import('../useFleetStore')
    const reloadedAsset = reloadedStore.getState().fleetAssets.find((a) => a.shipDefinitionId === 'ghost')
    expect(reloadedAsset?.customImageRef).toBeUndefined()
  })

  it('a real pre-existing manual asset persisted with no customImageRef key at all (an old save, written before this field existed) loads with it simply absent, not as an error', async () => {
    const { useFleetStore: store } = await import('../useFleetStore')
    const def = store.getState().shipDefinitions.find((d) => d.displayName === 'Gladius')!
    const added = store.getState().addFleetAsset(def.id, 'OWNED')

    // Simulate "written before this field existed" by stripping the key
    // from the already-persisted JSON directly, rather than fabricating
    // an entire synthetic save from scratch (which would also need a
    // matching Build/Hardpoint set to survive real reconciliation) —
    // this exercises the exact same real asset/build/hardpoint data the
    // store just legitimately produced, minus one key.
    const raw = JSON.parse(localStorage.getItem('sfm-fleet-store')!)
    const assetIndex = raw.state.fleetAssets.findIndex((a: { id: string }) => a.id === added.assetId)
    delete raw.state.fleetAssets[assetIndex].customImageRef
    localStorage.setItem('sfm-fleet-store', JSON.stringify(raw))

    const { vi: vitest } = await import('vitest')
    vitest.resetModules()
    const { useFleetStore: reloadedStore } = await import('../useFleetStore')
    const reloadedAsset = reloadedStore.getState().fleetAssets.find((a) => a.id === added.assetId)
    expect(reloadedAsset).toBeDefined()
    expect(reloadedAsset?.customImageRef).toBeUndefined()
  })
})

describe('UX-005A: ephemeral cache is never part of persisted state', () => {
  it('shipImageCache entries are not written to localStorage under the fleet-store key', async () => {
    useShipImageCacheStore.setState({ entries: { probe: { status: 'missing', ref: 'ships/probe.png' } } })
    const raw = localStorage.getItem('sfm-fleet-store')
    if (raw) {
      expect(raw).not.toContain('probe')
    }
  })
})
