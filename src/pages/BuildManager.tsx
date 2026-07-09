import { useState } from 'react'
import { Plus, Copy, Eye, Pencil, Trash2, X, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useFleetStore } from '../store/useFleetStore'
import ReadinessBar from '../components/ReadinessBar'

export default function BuildManager() {
  const ships = useFleetStore((s) => s.ships)
  const builds = useFleetStore((s) => s.builds)
  const addBuild = useFleetStore((s) => s.addBuild)
  const editBuild = useFleetStore((s) => s.editBuild)
  const duplicateBuild = useFleetStore((s) => s.duplicateBuild)
  const deleteBuild = useFleetStore((s) => s.deleteBuild)

  const [addShipId, setAddShipId] = useState<string | null>(null)
  const [editing, setEditing] = useState<null | { id: string; name: string; role: string }>(null)
  const [deleting, setDeleting] = useState<null | { id: string; name: string }>(null)

  const shipName = (id: string) => ships.find((s) => s.id === id)?.name ?? 'Unknown Ship'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Build Manager</p>
          <h1 className="text-2xl font-display font-bold text-white">What builds exist?</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAddShipId(ships[0]?.id ?? null)}
            className="inline-flex items-center gap-2 bg-cyan text-bg font-semibold text-sm px-4 py-2 rounded-lg hover:bg-cyan/90 transition-colors"
          >
            <Plus size={15} /> Add New Build
          </button>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-muted border-b border-white/5">
                <th className="px-5 py-3 font-medium">Ship</th>
                <th className="px-5 py-3 font-medium">Build</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium w-48">Readiness</th>
                <th className="px-5 py-3 font-medium">Missing</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {builds.map((b) => (
                <tr key={b.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3 text-white font-medium whitespace-nowrap">
                    {shipName(b.shipId)}
                    {b.isActive && <span className="ml-2 text-[10px] text-cyan uppercase tracking-widest">Active</span>}
                  </td>
                  <td className="px-5 py-3 text-cyan/90 whitespace-nowrap">{b.name}</td>
                  <td className="px-5 py-3 text-muted whitespace-nowrap">{b.role}</td>
                  <td className="px-5 py-3">
                    <ReadinessBar value={b.readiness} size="sm" />
                  </td>
                  <td className="px-5 py-3 text-warning text-xs">
                    {b.missing.length > 0 ? b.missing.join(', ') : <span className="text-success">None</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        to={`/ship/${b.shipId}`}
                        className="p-1.5 rounded-md text-muted hover:text-cyan hover:bg-cyan/10 transition-colors"
                        title="View / Ship Detail"
                      >
                        <Eye size={15} />
                      </Link>
                      <button
                        onClick={() => setEditing({ id: b.id, name: b.name, role: b.role })}
                        className="p-1.5 rounded-md text-muted hover:text-white hover:bg-white/10 transition-colors"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => duplicateBuild(b.id)}
                        className="p-1.5 rounded-md text-muted hover:text-white hover:bg-white/10 transition-colors"
                        title="Duplicate"
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        onClick={() => setDeleting({ id: b.id, name: b.name })}
                        className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Build modal */}
      {addShipId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setAddShipId(null)}>
          <div className="panel p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-semibold text-white">Add New Build</h3>
              <button onClick={() => setAddShipId(null)} className="text-muted hover:text-white">
                <X size={18} />
              </button>
            </div>
            <label className="text-xs uppercase tracking-widest text-muted block mb-2">Ship</label>
            <select
              value={addShipId}
              onChange={(e) => setAddShipId(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
            >
              {ships.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted mt-3">Creates a new Build for this ship with every hardpoint set to its Factory Loadout.</p>
            <button
              onClick={() => {
                addBuild(addShipId)
                setAddShipId(null)
              }}
              className="mt-4 w-full bg-cyan text-bg font-semibold text-sm py-2 rounded-lg hover:bg-cyan/90 transition-colors"
            >
              Create Build
            </button>
          </div>
        </div>
      )}

      {/* Edit Build modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setEditing(null)}>
          <div className="panel p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display font-semibold text-white">Edit Build</h3>
              <button onClick={() => setEditing(null)} className="text-muted hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Build Name</label>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-widest text-muted block mb-1.5">Role</label>
                <input
                  value={editing.role}
                  onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan/50"
                />
              </div>
            </div>
            <button
              onClick={() => {
                editBuild(editing.id, { name: editing.name, role: editing.role })
                setEditing(null)
              }}
              className="mt-4 w-full bg-cyan text-bg font-semibold text-sm py-2 rounded-lg hover:bg-cyan/90 transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4" onClick={() => setDeleting(null)}>
          <div className="panel p-6 max-w-sm w-full border-danger/30" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-3">
              <AlertTriangle className="text-danger shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-display font-semibold text-white">Delete "{deleting.name}"?</h3>
                <p className="text-sm text-muted mt-1">This removes the Build and its hardpoint data. This can't be undone.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setDeleting(null)}
                className="flex-1 border border-white/15 text-white font-medium text-sm py-2 rounded-lg hover:border-white/35 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteBuild(deleting.id)
                  setDeleting(null)
                }}
                className="flex-1 bg-danger text-white font-semibold text-sm py-2 rounded-lg hover:bg-danger/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
