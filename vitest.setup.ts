import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

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
