import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import MissionControl from './pages/MissionControl'
import FleetDashboard from './pages/FleetDashboard'
import ShipDetail from './pages/ShipDetail'
import HangarInventory from './pages/HangarInventory'
import QuickUpdate from './pages/QuickUpdate'
import DecisionCenter from './pages/DecisionCenter'
import FleetRoadmap from './pages/FleetRoadmap'
import CaptainsLog from './pages/CaptainsLog'
import MissionComposer from './pages/MissionComposer'
import ShipWorkspacePrototype from './pages/ShipWorkspacePrototype'

export default function App() {
  return (
    <div className="flex min-h-screen bg-bg text-white">
      <Sidebar />
      <main className="flex-1 min-w-0 px-6 py-8 md:px-10 md:py-10 max-w-[1400px]">
        <Routes>
          <Route path="/" element={<MissionControl />} />
          <Route path="/fleet" element={<FleetDashboard />} />
          {/* FTB-001A (Workstream D) — a bare "/ship" (no explicit id) is
              the general-navigation entry point (Sidebar's "Ship Detail"
              link): ShipDetail renders its blank "Select a Ship" empty
              state rather than ever inferring a first-ship default. */}
          <Route path="/ship" element={<ShipDetail />} />
          <Route path="/ship/:shipId" element={<ShipDetail />} />
          <Route path="/loadout-manager" element={<MissionComposer />} />
          {/* Beta 2.0 structural prototype (Commander Sea Trials) — isolated
              from Ship Detail / Loadout Manager, which remain unchanged. */}
          <Route path="/ship-workspace" element={<ShipWorkspacePrototype />} />
          <Route path="/ship-workspace/:shipId" element={<ShipWorkspacePrototype />} />
          <Route path="/hangar" element={<HangarInventory />} />
          <Route path="/quick-update" element={<QuickUpdate />} />
          <Route path="/decision-center" element={<DecisionCenter />} />
          <Route path="/roadmap" element={<FleetRoadmap />} />
          <Route path="/log" element={<CaptainsLog />} />
        </Routes>
      </main>
    </div>
  )
}
