import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
// UX-005A — jsdom has no IndexedDB implementation at all; fake-indexeddb
// provides a spec-compliant in-memory implementation so
// shipImageStorage.ts (and anything that transitively touches it) can be
// exercised for real in the test environment, not mocked function-by-
// function. `/auto` installs it onto the global scope exactly where
// browser code expects to find `indexedDB`.
import 'fake-indexeddb/auto'

// CAT-001A — the entire pre-existing test suite was written against the
// seed/demo fleet (src/data/seed.ts) as its baseline fixture, long before
// that fleet was gated behind VITE_SFM_DEV_SEED_FLEET (see
// src/store/useFleetStore.ts). Running the test suite IS a developer
// activity, so it opts in globally here, exactly like a developer would
// via a local .env.local — individual tests that specifically need to
// exercise the real "genuinely new Commander" behavior override this
// with vi.stubEnv('VITE_SFM_DEV_SEED_FLEET', 'false') + vi.resetModules()
// in their own setup.
vi.stubEnv('VITE_SFM_DEV_SEED_FLEET', 'true')

// SW-013B — jsdom has no IntersectionObserver, which ShipWorkspacePrototype's
// scroll-triggered sticky context relies on. Now that Ship Workspace is the
// primary navigation target (reachable from the real App router, not just
// its own dedicated test file), any test rendering the full App can hit this
// page incidentally. A minimal global stub keeps those tests from crashing;
// ShipWorkspacePrototype.test.tsx installs its own richer stub (with a
// captured callback) to simulate real scroll behavior.
if (typeof global.IntersectionObserver === 'undefined') {
  class NoopIntersectionObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  // @ts-expect-error — test-only global stub, not a real IntersectionObserver
  global.IntersectionObserver = NoopIntersectionObserver
}

// UX-005A — jsdom has no URL.createObjectURL/revokeObjectURL at all
// (confirmed directly: calling it throws "not a function"), which
// src/store/shipImageCache.ts relies on to turn a stored image Blob into
// an <img>-usable string. A minimal deterministic stub — a unique
// `blob:test-N` string per call — is enough for every test that checks
// "does the cache produce *a* src distinct per blob," without pulling in
// a real object-URL polyfill.
if (typeof global.URL.createObjectURL === 'undefined') {
  let counter = 0
  global.URL.createObjectURL = vi.fn(() => `blob:test-${++counter}`)
  global.URL.revokeObjectURL = vi.fn()
}
