import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
    // MWO-001: a genuine-reload test (vi.resetModules() + re-import) now
    // cold-imports the full 256-ship Golden Fleet dataset (shipDefinitions'
    // own dedup pass across 300 definitions, every deep-imported ship's
    // normalized port tree) — measured at ~9s, well past the 5s default.
    testTimeout: 20000,
    // EWO-054A test-infrastructure correction — `artifacts/` is a locally-
    // produced packaged release bundle (a frozen snapshot copy of an older
    // src/ tree, including its own *.test.ts(x) files) that lives outside
    // Vitest's own default excludes (which don't cover an arbitrary
    // top-level app folder). Left unexcluded, the plain `npm test` command
    // silently doubled the file/test count and ran a second, stale copy of
    // the suite against fixtures it no longer matches — see .gitignore's
    // matching entry for the other half of this fix. The ordinary `npm
    // test` command must exercise only the active repository source tree.
    exclude: [...configDefaults.exclude, 'artifacts/**'],
  },
})
