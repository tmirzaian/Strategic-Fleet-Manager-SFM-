import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { APP_VERSION_LABEL } from './config/appVersion'
import './index.css'

// RC-001 — the browser tab title was previously hardcoded in index.html
// and drifted out of sync with the real release version (found stale at
// "Beta 1.2" while the app itself already read "Beta 2.0 RC1"). Driving
// it from the same single source of truth as AppFooter/Captain's Log
// means it can never go stale again.
document.title = `Strategic Fleet Manager ${APP_VERSION_LABEL}`

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
