import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { APP_VERSION_LABEL } from './config/appVersion'
import { markBootStage } from './bootTelemetry'
import { wireBootSplash } from './bootSplash'
import './index.css'

// EWO-107 (Part B/D) — wired before the first mark below so it can catch
// up on any stage already recorded during this module's own import-graph
// evaluation (see bootSplash.ts's own doc comment for why that matters).
wireBootSplash()

// EWO-107 (Part A) — first checkpoint in the measured startup timeline:
// the root module has begun executing.
markBootStage('main-module-start')

// RC-001 — the browser tab title was previously hardcoded in index.html
// and drifted out of sync with the real release version (found stale at
// "Beta 1.2" while the app itself already read "Beta 2.0 RC1"). Driving
// it from the same single source of truth as AppFooter/Captain's Log
// means it can never go stale again.
document.title = `Strategic Fleet Manager ${APP_VERSION_LABEL}`

const root = ReactDOM.createRoot(document.getElementById('root')!)
markBootStage('react-root-created')

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
