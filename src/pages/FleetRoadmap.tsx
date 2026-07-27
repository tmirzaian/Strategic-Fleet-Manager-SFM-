import { ShipWheel, Target, Telescope, Sparkles } from 'lucide-react'

export default function FleetRoadmap() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-cyan/70 mb-1">Fleet Roadmap</p>
        <h1 className="text-2xl font-display font-bold text-white">Where is the fleet headed?</h1>
        <p className="text-sm text-muted mt-1">Quality-of-life view. Not required for day-to-day updates.</p>
      </div>

      <div className="panel p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-cyan/10 flex items-center justify-center shrink-0">
          <ShipWheel className="text-cyan" size={18} />
        </div>
        <div>
          <h3 className="font-display font-semibold text-white">Current Core Fleet</h3>
          <p className="text-sm text-muted mt-1">
            Twelve ships and vehicles spanning combat, industrial, cargo, transport, medical, and ground roles — the
            active backbone of day-to-day operations.
          </p>
        </div>
      </div>

      <div className="panel p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
          <Target className="text-success" size={18} />
        </div>
        <div>
          <h3 className="font-display font-semibold text-white">Next Goal</h3>
          <p className="text-sm text-muted mt-1">Vulture / Fortune for Salvage — finishing out the salvage loop.</p>
        </div>
      </div>

      <div className="panel p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
          <Telescope className="text-warning" size={18} />
        </div>
        <div>
          <h3 className="font-display font-semibold text-white">Future Goal</h3>
          <p className="text-sm text-muted mt-1">Cutlass Blue for Quantum Enforcement.</p>
        </div>
      </div>

      <div className="panel p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-cyan/10 flex items-center justify-center shrink-0">
          <Sparkles className="text-cyan" size={18} />
        </div>
        <div>
          <h3 className="font-display font-semibold text-white">Vision</h3>
          <p className="text-sm text-muted mt-1">
            StarSim / agent-based economy support, later — a distant future goal, well beyond current fleet priorities.
          </p>
        </div>
      </div>
    </div>
  )
}
