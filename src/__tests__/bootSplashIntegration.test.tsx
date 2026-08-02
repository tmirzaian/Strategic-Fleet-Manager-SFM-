import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { useFleetStore } from '../store/useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

// EWO-107 (Part I) — the two scenarios that depend on the rest of the
// application, not just the boot-splash modules in isolation: existing
// routes (including the ten now-lazy ones) still render real content
// through the Suspense boundary added in App.tsx, and persistence
// behavior/schema is untouched.
describe('EWO-107 — existing routes still render normally through the new Suspense boundary', () => {
  it('renders Mission Control (the one route that stayed a static import) immediately', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    expect(screen.getAllByText(/Mission Control/i).length).toBeGreaterThan(0)
  })

  it('resolves a lazy-loaded route to its real content, not just the loading fallback', async () => {
    render(
      <MemoryRouter initialEntries={['/flight-commander']}>
        <App />
      </MemoryRouter>
    )
    expect(await screen.findByText(/Flight Commander/i)).toBeInTheDocument()
  })

  it('resolves a second lazy-loaded route (Captain\'s Log) to its real content', async () => {
    render(
      <MemoryRouter initialEntries={['/log']}>
        <App />
      </MemoryRouter>
    )
    expect(await screen.findAllByText(/Captain's Log/i)).not.toHaveLength(0)
  })
})

describe('EWO-107 — no persistence schema or fleet-data behavior changes (Part G constraint)', () => {
  it('leaves PERSIST_VERSION, migrate, merge, and the new onRehydrateStorage hook all wired on the live store', () => {
    const options = useFleetStore.persist.getOptions()
    // Unchanged from the pre-EWO-107 baseline — Part G explicitly forbids
    // touching PERSIST_VERSION or the persistence architecture itself.
    expect(options.version).toBe(11)
    expect(typeof options.migrate).toBe('function')
    expect(typeof options.merge).toBe('function')
    expect(typeof options.onRehydrateStorage).toBe('function')
  })
})
