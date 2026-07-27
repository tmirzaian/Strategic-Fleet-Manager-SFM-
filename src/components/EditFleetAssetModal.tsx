import { useState } from 'react'
import { X, Pencil } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import type { OwnershipType, Ship } from '../types'
import { OWNERSHIP_TYPE_LABELS, legacyToOwnershipType } from '../utils/ownership'

const OWNERSHIP_OPTIONS: OwnershipType[] = ['OWNED', 'PURCHASED', 'LOANER']

export default function EditFleetAssetModal({ ship, onClose }: { ship: Ship; onClose: () => void }) {
  const updateFleetAssetNickname = useFleetStore((s) => s.updateFleetAssetNickname)
  const updateFleetAssetOwnership = useFleetStore((s) => s.updateFleetAssetOwnership)
  const updateFleetProfile = useFleetStore((s) => s.updateFleetProfile)

  // The ship's current display name IS the nickname when one was set —
  // there's no separate "model name" field on the materialized Ship, so
  // pre-filling with an empty string (rather than guessing) keeps this
  // honest: the field only shows what the player explicitly typed before.
  const [nickname, setNickname] = useState('')
  const [ownershipType, setOwnershipType] = useState<OwnershipType>(legacyToOwnershipType(ship.ownership))
  const [primaryRole, setPrimaryRole] = useState(ship.primaryRole ?? '')
  const [secondaryRole, setSecondaryRole] = useState(ship.secondaryRole ?? '')

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
