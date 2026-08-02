import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import AppFooter from './components/layout/AppFooter'
import MissionControl from './pages/MissionControl'
// EWO-107 (Part I regression check) — FleetDashboard, ShipDetail, and
// MissionComposer stay static imports even though they were originally
// lazy-loaded below: the existing Commander-flow regression suites
// (navigationFlow/shipCardCommanderFlow/shipImageCommanderFlow.test.tsx)
// click through to these three pages and assert on their content
// synchronously, without awaiting a Suspense boundary. Retrofitting three
// large, narrative, multi-step pre-existing test files to await every
// lazy transition was judged higher-risk than the marginal extra
// transform cost of these three, so they were reverted — see the report's
// Part F/G section for the full measured before/after and disposition.
import FleetDashboard from './pages/FleetDashboard'
import ShipDetail from './pages/ShipDetail'
import MissionComposer from './pages/MissionComposer'
import { markBootStage, reportFirstRenderComplete } from './bootTelemetry'

// EWO-107 (Part F/G) — Mission Control and the three pages above stay
// static imports. The remaining seven pages were previously ALL
// statically imported here too, which measurement showed forces the dev
// server to transform — and the production bundle to include — every
// route's code before Mission Control could render. Confirmed via
// Playwright: on a cold dev server, ShipWorkspacePrototype, FlightCommander,
// MissionComposer, and CaptainsLog each cost 600ms+ to transform on the
// very first request to "/", despite none of their code executing on that
// route. Route-level code-splitting is Part G's own named example of a
// "clearly measurement-supported" low-risk optimization.
const HangarInventory = lazy(() => import('./pages/HangarInventory'))
const QuickUpdate = lazy(() => import('./pages/QuickUpdate'))
const DecisionCenter = lazy(() => import('./pages/DecisionCenter'))
const FleetRoadmap = lazy(() => import('./pages/FleetRoadmap'))
const CaptainsLog = lazy(() => import('./pages/CaptainsLog'))
const ShipWorkspacePrototype = lazy(() => import('./pages/ShipWorkspacePrototype'))
const FlightCommander = lazy(() => import('./pages/FlightCommander'))

// EWO-107 (Part G) — a minimal, unobtrusive fallback for the brief gap
// while a non-initial route's chunk loads (typically a handful of
// milliseconds once cached). This is a route-transition affordance, not
// the boot splash (Part B) — it never appears on the very first load of
// "/", since Mission Control is not lazy.
function RouteLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center py-16 text-sm tracking-wide text-white/50">
      Loading workstation…
    </div>
  )
}

export default function App() {
  const location = useLocation()

  // EWO-107 (Part A) — fires once, after the application's first commit
  // (this effect body only ever runs on mount in production; StrictMode's
  // dev-only double-invoke is harmless since reportFirstRenderComplete is
  // idempotent).
  useEffect(() => {
    reportFirstRenderComplete()
  }, [])

  // EWO-107 (Part A) — the "selected route render" checkpoint. Recorded on
  // every route change, not just the initial one, since markBootStage
  // never deduplicates.
  useEffect(() => {
    markBootStage('route-render')
  }, [location.pathname])

  return (
    <div className="flex min-h-screen bg-bg text-white">
      <Sidebar />
      {/* UX-004A (Deliverable 3) — a min-height flex shell: the routed
          content grows to fill the viewport (`flex-1`) so AppFooter is
          pinned to the viewport bottom on short pages and simply follows
          content on long/scrolling ones, per the work order's own
          "Header/Content flex-grow / Footer" shape. Page padding is
          entirely unchanged (still on the content wrapper only) — this is
          a shell change, not a page-content change. */}
      <main className="flex-1 min-w-0 max-w-[1400px] flex flex-col">
        <div className="flex-1 px-6 py-8 md:px-10 md:py-10">
          <Suspense fallback={<RouteLoadingFallback />}>
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
              {/* EWO-104 — the terminus of the Mission Control -> Fleet
                  Dashboard -> Ship Management operational chain: "am I ready
                  to launch?" Placed with the principal operational
                  workspaces, immediately after Ship Management. */}
              <Route path="/flight-commander" element={<FlightCommander />} />
              <Route path="/hangar" element={<HangarInventory />} />
              <Route path="/quick-update" element={<QuickUpdate />} />
              <Route path="/decision-center" element={<DecisionCenter />} />
              <Route path="/roadmap" element={<FleetRoadmap />} />
              <Route path="/log" element={<CaptainsLog />} />
            </Routes>
          </Suspense>
        </div>
        <AppFooter />
      </main>
    </div>
  )
}
