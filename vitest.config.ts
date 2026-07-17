import { defineConfig } from 'vitest/config'
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
  },
})
