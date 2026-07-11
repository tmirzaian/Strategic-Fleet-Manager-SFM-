import { describe, it, expect } from 'vitest'
import { APP_VERSION, APP_VERSION_LABEL } from '../appVersion'

describe('APP_VERSION (Part 1, test 1)', () => {
  it('1. exposes a single central version constant used by the header', () => {
    expect(APP_VERSION.productVersion).toBe('Alpha 2.5C')
    expect(APP_VERSION_LABEL).toBe(APP_VERSION.productVersion)
  })

  it('no hardcoded "Sprint 1" string remains in the Sidebar source', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const sidebarPath = path.resolve(process.cwd(), 'src/components/Sidebar.tsx')
    const source = fs.readFileSync(sidebarPath, 'utf-8')
    expect(source).not.toContain('Sprint 1')
    expect(source).toContain('APP_VERSION_LABEL')
  })
})
