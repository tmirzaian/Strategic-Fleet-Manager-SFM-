import { useRef, useState } from 'react'
import { X, Pencil, ImagePlus, RotateCcw } from 'lucide-react'
import { useFleetStore, resolveFleetAssetId } from '../store/useFleetStore'
import { useShipImageCacheStore } from '../store/shipImageCache'
import { useResolvedShipImage } from '../utils/useResolvedShipImage'
import { validateShipImageFile, storeShipImage, deleteShipImage } from '../utils/shipImageStorage'
import type { OwnershipType, Ship } from '../types'
import { OWNERSHIP_TYPE_LABELS, legacyToOwnershipType } from '../utils/ownership'
import ShipImage from './ShipImage'

const OWNERSHIP_OPTIONS: OwnershipType[] = ['OWNED', 'PURCHASED', 'LOANER']

export default function EditFleetAssetModal({ ship, onClose }: { ship: Ship; onClose: () => void }) {
  const updateFleetAssetNickname = useFleetStore((s) => s.updateFleetAssetNickname)
  const updateFleetAssetOwnership = useFleetStore((s) => s.updateFleetAssetOwnership)
  const updateFleetProfile = useFleetStore((s) => s.updateFleetProfile)
  const updateFleetAssetCustomImage = useFleetStore((s) => s.updateFleetAssetCustomImage)
  // UX-005A (Deliverable 4) — whether THIS vessel currently has a custom
  // image on record (governs whether "Restore Default" is offered at
  // all); read directly from the store rather than local component
  // state, so it stays correct even if a caller reopens this modal for a
  // different ship without a full remount.
  const hasCustomImage = useFleetStore((s) => {
    const assetId = resolveFleetAssetId(ship.id, s.fleetAssets)
    return Boolean(assetId && s.fleetAssets.find((a) => a.id === assetId)?.customImageRef)
  })
  const invalidateShipImageCache = useShipImageCacheStore((s) => s.invalidate)
  // Same shared resolver every other ship-image surface uses (Deliverable
  // 3) — the preview here is never a bespoke reimplementation, and
  // `customUnavailable` is exactly the state Deliverable 3 asks this
  // surface to be able to show.
  const { src: currentImageSrc, customUnavailable } = useResolvedShipImage(ship.id, ship.imageUrl)

  // The ship's current display name IS the nickname when one was set —
  // there's no separate "model name" field on the materialized Ship, so
  // pre-filling with an empty string (rather than guessing) keeps this
  // honest: the field only shows what the player explicitly typed before.
  const [nickname, setNickname] = useState('')
  const [ownershipType, setOwnershipType] = useState<OwnershipType>(legacyToOwnershipType(ship.ownership))
  const [primaryRole, setPrimaryRole] = useState(ship.primaryRole ?? '')
  const [secondaryRole, setSecondaryRole] = useState(ship.secondaryRole ?? '')

  // UX-005A (Deliverable 4) — image actions apply immediately, unlike
  // Nickname/Ownership/Fleet Profile above (which stay local draft state
  // until "Update Fleet Registry" is clicked). A file picker has no
  // natural "cancel my selection" affordance the way a text field does,
  // and the work order's own spec is explicit: "Preview updates
  // immediately" / "The selected file is copied into managed storage"
  // the moment it's chosen, not deferred to a batch save.
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)

  async function handleChooseImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // always allow re-selecting the exact same file again later
    if (!file) return
    setImageError(null)
    const validation = await validateShipImageFile(file)
    if (!validation.valid) {
      setImageError(validation.reason ?? 'That file could not be used.')
      return
    }
    setImageBusy(true)
    try {
      const { ref } = await storeShipImage(ship.id, file)
      updateFleetAssetCustomImage(ship.id, ref)
      invalidateShipImageCache(ship.id)
    } catch {
      setImageError('Could not save that image. Please try again.')
    } finally {
      setImageBusy(false)
    }
  }

  async function handleRestoreDefaultImage() {
    setImageError(null)
    setImageBusy(true)
    try {
      await deleteShipImage(ship.id)
    } finally {
      updateFleetAssetCustomImage(ship.id, undefined)
      invalidateShipImageCache(ship.id)
      setImageBusy(false)
    }
  }

  function handleSave() {
    if (nickname.trim()) {
      updateFleetAssetNickname(ship.id, nickname.trim())
    }
    updateFleetAssetOwnership(ship.id, ownershipType)
    updateFleetProfile(ship.id, {
      primaryRole: primaryRole.trim() || undefined,
      secondaryRole: secondaryRole.trim() || undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="panel p-6 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-lg text-white flex items-center gap-2">
              <Pencil size={16} className="text-cyan" /> Edit Fleet Asset
            </h3>
            <p className="text-xs text-muted mt-0.5">Updates this specific ship — other copies of the same model are unaffected.</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Nickname</label>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={ship.name} className="w-full" />
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Ownership</label>
            <select value={ownershipType} onChange={(e) => setOwnershipType(e.target.value as OwnershipType)} className="w-full">
              {OWNERSHIP_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {OWNERSHIP_TYPE_LABELS[o]}
                </option>
              ))}
            </select>
          </div>

          <div className="scanline-divider" />

          {/* UX-005A (Deliverable 4) — Ship Image. Belongs to this exact
              vessel instance, never the ship model (see FleetAsset.
              customImageRef's own doc comment) — the subtitle above
              already tells the Commander that in general terms. */}
          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Ship Image</label>
            <div className="flex items-center gap-3">
              <div className="w-20 h-14 rounded-lg overflow-hidden border border-white/10 bg-black/30 shrink-0">
                <ShipImage src={currentImageSrc} alt={ship.name} className="w-full h-full" imageClassName="w-full h-full object-cover" presentation="cover" overlay={false} />
              </div>
              <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={imageBusy}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
                  >
                    <ImagePlus size={13} /> Choose Custom Image
                  </button>
                  {hasCustomImage && (
                    <button
                      type="button"
                      onClick={handleRestoreDefaultImage}
                      disabled={imageBusy}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RotateCcw size={13} /> Restore Default
                    </button>
                  )}
                </div>
                {customUnavailable && <p className="text-[11px] text-warning">Custom image file is unavailable — showing the default image.</p>}
                {imageError && <p className="text-[11px] text-danger">{imageError}</p>}
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleChooseImageFile} />
          </div>

          <div className="scanline-divider" />

          {/* Fleet Profile (Alpha 2.4, Part 7) — Primary/Secondary Role
              are descriptive only, independent of the authoritative Ship
              Classification used for filtering (Part 9). Fleet Priority
              moved out of this modal (EWO-066 Part E) — Ship
              Management's own Ship Priority panel is now the single
              place it's edited, alongside the ship it actually belongs to. */}
          <div>
            <p className="text-xs uppercase tracking-widest text-cyan/80 mb-3">Fleet Profile</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-widest text-muted block mb-2">Primary Role</label>
                <input value={primaryRole} onChange={(e) => setPrimaryRole(e.target.value)} placeholder="e.g. Escort" className="w-full" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted block mb-2">Secondary Role</label>
                <input value={secondaryRole} onChange={(e) => setSecondaryRole(e.target.value)} placeholder="e.g. Cargo Support" className="w-full" />
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="w-full inline-flex items-center justify-center gap-2 bg-cyan text-bg font-semibold text-sm py-2.5 rounded-lg hover:bg-cyan/90 transition-colors"
          >
            Update Fleet Registry
          </button>
        </div>
      </div>
    </div>
  )
}
