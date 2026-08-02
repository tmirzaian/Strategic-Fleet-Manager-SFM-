import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// EWO-107 (Part I) — the boot splash's DOM/CSS/inline-script contract
// lives in index.html itself, outside the React module graph (Part B:
// "must not block if JS fails"), so it's verified here as static content
// rather than through component rendering.
const indexHtml = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8')

describe('index.html — static boot splash (EWO-107 Part B/D/H)', () => {
  it('paints an immediate dark boot surface, before #root, with no dependency on external CSS', () => {
    const splashIndex = indexHtml.indexOf('id="sfm-boot-splash"')
    const rootIndex = indexHtml.indexOf('id="root"')
    expect(splashIndex).toBeGreaterThan(-1)
    expect(rootIndex).toBeGreaterThan(-1)
    expect(splashIndex).toBeLessThan(rootIndex)
  })

  it('sets the dark background inline on html, body, and #root — nothing can flash white before React mounts', () => {
    expect(indexHtml).toMatch(/html,\s*\n\s*body\s*{[^}]*background:\s*#071016/)
    expect(indexHtml).toMatch(/#root\s*{[^}]*background:\s*#071016/)
  })

  it('never marks readiness from a fixed timeout — only real stages (relayed via bootSplash.ts) may call ready()', () => {
    const script = indexHtml.slice(indexHtml.indexOf('__sfmBootSplash = {'), indexHtml.indexOf('</script>', indexHtml.indexOf('__sfmBootSplash = {')))
    expect(script).toMatch(/setTimeout\(showLongWait/)
    expect(script).toMatch(/setTimeout\(showFailure/)
    expect(script).not.toMatch(/setTimeout\(ready/)
    // The two timeout handlers only ever mutate status text / reveal the
    // reload button — neither is capable of hiding the splash.
    const showLongWaitBody = script.slice(script.indexOf('function showLongWait'), script.indexOf('function showFailure'))
    const showFailureBody = script.slice(script.indexOf('function showFailure'), script.indexOf('function ready'))
    expect(showLongWaitBody).not.toMatch(/data-hidden/)
    expect(showFailureBody).not.toMatch(/data-hidden/)
  })

  it('supports prefers-reduced-motion: the fade transition is disabled and the emblem spin is gated', () => {
    expect(indexHtml).toMatch(/@media \(prefers-reduced-motion: reduce\)[^{]*{\s*#sfm-boot-splash\s*{\s*transition:\s*none/)
    expect(indexHtml).toMatch(/@media \(prefers-reduced-motion: no-preference\)[^{]*{\s*\.sfm-boot-splash__emblem/)
  })

  it('failure state sets branded, readable text and a reload action — without touching the dark surface itself', () => {
    expect(indexHtml).toContain('COMMAND SYSTEM INITIALIZATION FAILED')
    expect(indexHtml).toContain('COMMAND SYSTEMS ARE TAKING LONGER THAN EXPECTED')
    expect(indexHtml).toMatch(/reloadBtn\.hidden = false/)
    expect(indexHtml).toMatch(/reloadBtn\.onclick = function \(\) \{\s*window\.location\.reload\(\)/)
    // No stack traces / raw exceptions are ever surfaced.
    expect(indexHtml).not.toMatch(/error\.message|err\.stack|e\.message/)
  })

  it('never uses a fabricated percentage or an independent status-rotation timer', () => {
    expect(indexHtml).not.toMatch(/\d+%/)
    // setInterval would imply a timer-driven rotation independent of real events.
    expect(indexHtml).not.toMatch(/setInterval/)
  })

  it('loads the Google Fonts stylesheet without blocking first paint', () => {
    expect(indexHtml).toMatch(/rel="stylesheet"\s*\n\s*media="print"\s*\n\s*onload="this\.media='all'"/)
    expect(indexHtml).toContain('<noscript>')
  })
})
