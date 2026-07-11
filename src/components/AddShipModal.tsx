import { useMemo, useState } from 'react'
import { X, Plus, Search } from 'lucide-react'
import { useFleetStore } from '../store/useFleetStore'
import type { OwnershipType } from '../types'
import { OWNERSHIP_TYPE_LABELS } from '../utils/ownership'

const OWNERSHIP_OPTIONS: OwnershipType[] = ['OWNED', 'PURCHASED', 'LOANER']

export default function AddShipModal({ onClose }: { onClose: () => void }) {
  const shipDefinitions = useFleetStore((s) => s.shipDefinitions)
  const addFleetAsset = useFleetStore((s) => s.addFleetAsset)

  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>('')
  const [ownershipType, setOwnershipType] = useState<OwnershipType>('OWNED')
  const [nickname, setNickname] = useState('')
  const [priority, setPriority] = useState('')
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const filteredDefinitions = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? shipDefinitions.filter((d) => d.displayName.toLowerCase().includes(q) || d.manufacturer.toLowerCase().includes(q)) : shipDefinitions
    return [...list].sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [shipDefinitions, query])

  const selected = shipDefinitions.find((d) => d.id === selectedId)

  function handleConfirm() {
    if (!selected) {
      setResult({ success: false, message: 'Select a ship model first.' })
      return
    }
    const parsedPriority = priority.trim() ? Number(priority) : undefined
    const outcome = addFleetAsset(selected.id, ownershipType, nickname.trim() || undefined, parsedPriority)
    if (outcome.success) {
      onClose()
    } else {
      setResult({ success: false, message: outcome.message ?? 'Could not add ship.' })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="panel p-6 max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-display font-semibold text-lg text-white">Add Ship</h3>
            <p className="text-xs text-muted mt-0.5">Adds a real Fleet Asset — it appears on Fleet Dashboard immediately.</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Ship Model</label>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ship models…"
                className="w-full pl-8"
              />
            </div>
            <select
              size={6}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full"
            >
              {filteredDefinitions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName} — {d.manufacturer}
                </option>
              ))}
            </select>
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

          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Nickname (optional)</label>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Titan Hauler" className="w-full" />
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Priority (optional)</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              placeholder="Defaults to lowest normal priority"
              className="w-full"
            />
          </div>

          {result && !result.success && <p className="text-xs text-danger">{result.message}</p>}

          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="w-full inline-flex items-center justify-center gap-2 bg-cyan text-bg font-semibold text-sm py-2.5 rounded-lg hover:bg-cyan/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={15} /> Add to Fleet
          </button>
        </div>
      </div>
    </div>
  )
}
