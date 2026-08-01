import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Pencil, ImagePlus, RotateCcw, Archive, ShieldCheck, AlertTriangle, Trash2 } from 'lucide-react'
import { useFleetStore, resolveFleetAssetId } from '../store/useFleetStore'
import { useShipImageCacheStore } from '../store/shipImageCache'
import { useResolvedShipImage } from '../utils/useResolvedShipImage'
import { validateShipImageFile, storeShipImage, deleteShipImage } from '../utils/shipImageStorage'
import { isActiveShip, activeReservationsForShip, resolvePurgeConfirmationPhrase, matchesPurgeConfirmationPhrase } from '../utils/fleetLifecycle'
import type { OwnershipType, Ship } from '../types'
import { OWNERSHIP_TYPE_LABELS, legacyToOwnershipType } from '../utils/ownership'
import ShipImage from './ShipImage'

const OWNERSHIP_OPTIONS: OwnershipType[] = ['OWNED', 'PURCHASED', 'LOANER']

export default function EditFleetAssetModal({ ship, onClose }: { ship: Ship; onClose: () => void }) {
  const navigate = useNavigate()
  const updateFleetAssetNickname = useFleetStore((s) => s.updateFleetAssetNickname)
  const updateFleetAssetOwnership = useFleetStore((s) => s.updateFleetAssetOwnership)
  const updateFleetProfile = useFleetStore((s) => s.updateFleetProfile)
  const updateFleetAssetCustomImage = useFleetStore((s) => s.updateFleetAssetCustomImage)
  const retireFleetAsset = useFleetStore((s) => s.retireFleetAsset)
  const recommissionFleetAsset = useFleetStore((s) => s.recommissionFleetAsset)
  const purgeFleetAsset = useFleetStore((s) => s.purgeFleetAsset)
  const builds = useFleetStore((s) => s.builds)
  const reservations = useFleetStore((s) => s.reservations)
  const installedLoadouts = useFleetStore((s) => s.installedLoadouts)
  // SW-015C — read live off the store (not a prop snapshot) so the
  // section updates in place the instant recommission/retire happens,
  // without needing the caller to remount this modal.
  const lifecycleStatus = useFleetStore((s) => {
    const assetId = resolveFleetAssetId(ship.id, s.fleetAssets)
    const asset = assetId ? s.fleetAssets.find((a) => a.id === assetId) : undefined
    return asset?.lifecycleStatus ?? ship.lifecycleStatus
  })
  const isActive = isActiveShip({ lifecycleStatus })
  const [retireConfirmOpen, setRetireConfirmOpen] = useState(false)
  const [recommissionConfirmOpen, setRecommissionConfirmOpen] = useState(false)
  // Deliverable 3/6 — computed live so the confirmation dialog's preview
  // count can never drift from what the real action would actually
  // release; both read the exact same shared helper
  // (src/utils/fleetLifecycle.ts).
  const releasableReservationCount = activeReservationsForShip(ship.id, builds, reservations).length

  function handleRetire() {
    retireFleetAsset(ship.id)
    setRetireConfirmOpen(false)
    onClose()
    navigate('/fleet')
  }

  function handleRecommission() {
    recommissionFleetAsset(ship.id)
    setRecommissionConfirmOpen(false)
  }

  // EWO-097 — Danger Zone / Purge Fleet Asset. Only ever offered when
  // `!isActive` (Eligibility rule 2/3 — an active vessel must be retired
  // first, and this control simply doesn't render for one at all, so
  // there is no separate "disabled" state to test around).
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false)
  const [purgeTypedName, setPurgeTypedName] = useState('')
  const [purgeBusy, setPurgeBusy] = useState(false)
  // EWO-097 Amendment — the one canonical confirmation phrase (nickname,
  // else the canonical ship-model display name), read live off the real
  // FleetAsset rather than the materialized `Ship.name` prop, and shared
  // by the heading, the "Type ___ to confirm" instruction, the input's
  // accessible label, and button enablement below — never re-derived
  // per call site.
  const purgePhrase = useFleetStore((s) => {
    const assetId = resolveFleetAssetId(ship.id, s.fleetAssets)
    const asset = assetId ? s.fleetAssets.find((a) => a.id === assetId) : undefined
    return asset ? resolvePurgeConfirmationPhrase(asset) : ship.name
  })
  // Same live-preview discipline as `releasableReservationCount` above —
  // reads the exact same field (`installedLoadouts`) the store action
  // itself iterates, so the confirmation copy can never drift from what
  // the real purge would actually return.
  const installedOwnedComponentCount = installedLoadouts.filter((e) => e.shipId === ship.id && e.installedItem && e.installedItem !== '—').length
  const purgeNameMatches = matchesPurgeConfirmationPhrase(purgeTypedName, purgePhrase)

  function closePurgeConfirm() {
    setPurgeConfirmOpen(false)
    setPurgeTypedName('')
  }

  async function handlePurge() {
    if (!purgeNameMatches || purgeBusy) return
    setPurgeBusy(true)
    try {
      // EWO-097 Amendment (Requirement 7) — the store action independently
      // re-validates `purgeTypedName` against the same canonical phrase;
      // this call never relies on the disabled-button state alone.
      const result = purgeFleetAsset(ship.id, purgeTypedName)
      if (!result.success) {
        setPurgeBusy(false)
        return
      }
      // The stored image blob lives in IndexedDB, a separate storage
      // system from the Zustand-persisted fleet state the store action
      // above already fully cleaned up — deleted here via the exact same
      // established call site pattern `handleRestoreDefaultImage` already
      // uses, never a bespoke second deletion path.
      await deleteShipImage(ship.id)
      closePurgeConfirm()
      onClose()
      navigate('/fleet', { state: { purgedShipName: ship.name } })
    } finally {
      setPurgeBusy(false)
    }
  }
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
            {/* SW-015C — renamed from "Update Fleet Registry" (unchanged
                scope: Nickname/Ownership/Fleet Profile) now that a real
                "Fleet Registry" section exists directly below — the two
                labels being near-identical while meaning completely
                different things was a self-inflicted confusion this
                mission's own new section would otherwise create. */}
            Save Changes
          </button>

          <div className="scanline-divider" />

          {/* SW-015C (Deliverable 2) — Fleet Registry: the vessel
              lifecycle, clearly separated from every field above (which
              batches into "Save Changes"). Retire/Recommission apply
              immediately through their own confirmation, exactly like
              the Ship Image actions above — never deferred to the batch
              save. */}
          <div>
            <p className="text-xs uppercase tracking-widest text-cyan/80 mb-3">Fleet Registry</p>
            {isActive ? (
              <div className="bg-black/20 border border-white/5 rounded-lg p-3.5 space-y-3">
                <div className="flex items-center gap-2 text-sm text-white">
                  <ShieldCheck size={15} className="text-success" /> Status: Active Service
                </div>
                <div>
                  <p className="text-xs text-muted mb-2">
                    Remove this vessel from current fleet operations while preserving its identity, loadouts, image, and history.
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetireConfirmOpen(true)}
                    className="inline-flex items-center gap-1.5 border border-danger/30 text-danger font-medium text-xs px-3 py-2 rounded-lg hover:bg-danger/10 hover:border-danger/50 transition-colors"
                  >
                    <Archive size={13} /> Retire Vessel
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-black/20 border border-white/5 rounded-lg p-3.5 space-y-3">
                <div className="flex items-center gap-2 text-sm text-white">
                  <Archive size={15} className="text-muted" /> Status: Retired
                </div>
                <button
                  type="button"
                  onClick={() => setRecommissionConfirmOpen(true)}
                  className="inline-flex items-center gap-1.5 bg-cyan text-bg font-semibold text-xs px-3 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
                >
                  <ShieldCheck size={13} /> Return to Active Service
                </button>
              </div>
            )}
          </div>

          {/* EWO-097 — Danger Zone. Rendered when, and only when, this
              asset is retired (Eligibility rules 2/3) — never offered as
              a disabled control on an active vessel, never reachable from
              any active-ship workflow at all. */}
          {!isActive && (
            <>
              <div className="scanline-divider" />
              <div>
                <p className="text-xs uppercase tracking-widest text-danger/80 mb-3">Danger Zone</p>
                <div className="bg-danger/5 border border-danger/30 rounded-lg p-3.5 space-y-3">
                  <p className="text-xs text-muted">Permanently remove this fleet asset and its ship-specific planning data.</p>
                  <button
                    type="button"
                    onClick={() => setPurgeConfirmOpen(true)}
                    className="inline-flex items-center gap-1.5 bg-danger text-white font-semibold text-xs px-3 py-2 rounded-lg hover:bg-danger/90 transition-colors"
                  >
                    <Trash2 size={13} /> Purge Fleet Asset
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Deliverable 3 — retirement confirmation. A deliberate warning
          treatment (danger-toned icon/border), but never the typed-
          "DELETE"-to-confirm pattern Ship Detail's old destructive
          Remove action used — retirement is reversible, not destructive,
          and must never be presented as permanent deletion. */}
      {retireConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] px-4" onClick={() => setRetireConfirmOpen(false)}>
          <div className="panel p-6 max-w-sm w-full border-danger/30" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-danger shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-danger/80 font-semibold mb-1">Retire Vessel</p>
                  <h3 className="font-display font-semibold text-white">Retire "{ship.name}" from active service?</h3>
                  <p className="text-sm text-muted mt-1.5">
                    This vessel will be removed from active fleet operations, readiness, priority, demand, and reservation planning.
                  </p>
                  <p className="text-sm text-muted mt-1.5">
                    Its vessel record, custom image, loadouts, installed configuration, and history will be preserved for future recommissioning.
                  </p>
                  {releasableReservationCount > 0 && (
                    <p className="text-sm text-warning mt-1.5">
                      Retiring this vessel will release {releasableReservationCount} component reservation{releasableReservationCount === 1 ? '' : 's'}.
                    </p>
                  )}
                </div>
              </div>
              <button onClick={() => setRetireConfirmOpen(false)} className="text-muted hover:text-white shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setRetireConfirmOpen(false)}
                className="flex-1 border border-white/15 text-white font-medium text-sm py-2 rounded-lg hover:border-white/35 transition-colors"
              >
                Cancel
              </button>
              <button onClick={handleRetire} className="flex-1 bg-danger text-white font-semibold text-sm py-2 rounded-lg hover:bg-danger/90 transition-colors">
                Retire Vessel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deliverable 8 — recommission confirmation. Simple, no
          destructive-warning language or styling — this is the opposite
          of a destructive action. */}
      {recommissionConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] px-4" onClick={() => setRecommissionConfirmOpen(false)}>
          <div className="panel p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <ShieldCheck className="text-cyan shrink-0 mt-0.5" size={20} />
                <div>
                  <h3 className="font-display font-semibold text-white">Return "{ship.name}" to active service?</h3>
                  <p className="text-sm text-muted mt-1.5">
                    Restores its saved configuration and image, and returns it to active fleet operations, readiness, and demand. Previously released reservations are not automatically restored.
                  </p>
                </div>
              </div>
              <button onClick={() => setRecommissionConfirmOpen(false)} className="text-muted hover:text-white shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setRecommissionConfirmOpen(false)}
                className="flex-1 border border-white/15 text-white font-medium text-sm py-2 rounded-lg hover:border-white/35 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRecommission}
                className="flex-1 bg-cyan text-bg font-semibold text-sm py-2 rounded-lg hover:bg-cyan/90 transition-colors"
              >
                Return to Active Service
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EWO-097 — Purge confirmation. Unlike Retire's warning-toned but
          single-click confirmation, this is genuinely permanent — the
          typed-name safeguard (Recommended safeguard, EWO-097) is the one
          destructive-confirmation pattern this app uses anywhere, exactly
          because this is the one genuinely destructive action it has. */}
      {purgeConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] px-4" onClick={closePurgeConfirm}>
          <div className="panel p-6 max-w-sm w-full border-danger/30" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <Trash2 className="text-danger shrink-0 mt-0.5" size={20} />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-danger/80 font-semibold mb-1">Purge Fleet Asset</p>
                  <h3 className="font-display font-semibold text-white">Permanently purge "{purgePhrase}"?</h3>
                  <p className="text-sm text-muted mt-1.5">
                    This permanently removes this fleet asset and its ship-specific planning data — Loadouts, installed configuration, reservations, and Fleet Registry metadata. This cannot be undone.
                  </p>
                  {installedOwnedComponentCount > 0 && (
                    <p className="text-sm text-muted mt-1.5">
                      {installedOwnedComponentCount} installed owned component{installedOwnedComponentCount === 1 ? '' : 's'} will be returned to Hangar Inventory first.
                    </p>
                  )}
                  <p className="text-sm text-muted mt-1.5">Recovery requires importing or restoring an earlier fleet snapshot — there is no in-app undo.</p>
                  <label className="block mt-3">
                    {/* EWO-097 Amendment — `normal-case` explicitly resets
                        the parent's `uppercase` text-transform for the
                        phrase itself: CSS text-transform is inherited by
                        descendants, so without this override the phrase
                        rendered visually differently (e.g. "SABRE") from
                        the literal string a Commander had to type
                        ("Sabre") — a real, confirmed presentation/
                        validation mismatch. Never uppercase the phrase
                        through string transformation either — only this
                        one CSS reset, applied once, here. */}
                    <span className="text-xs uppercase tracking-widest text-muted block mb-1.5">
                      Type <span className="normal-case text-white font-medium">{purgePhrase}</span> to confirm
                    </span>
                    <input
                      value={purgeTypedName}
                      onChange={(e) => setPurgeTypedName(e.target.value)}
                      placeholder="Type the ship name to confirm"
                      aria-label={`Type ${purgePhrase} to confirm`}
                      className="w-full"
                      autoComplete="off"
                      autoFocus
                    />
                  </label>
                </div>
              </div>
              <button onClick={closePurgeConfirm} className="text-muted hover:text-white shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={closePurgeConfirm}
                className="flex-1 border border-white/15 text-white font-medium text-sm py-2 rounded-lg hover:border-white/35 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePurge}
                disabled={!purgeNameMatches || purgeBusy}
                className="flex-1 bg-danger text-white font-semibold text-sm py-2 rounded-lg hover:bg-danger/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-danger"
              >
                {purgeBusy ? 'Purging…' : 'Purge Fleet Asset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
