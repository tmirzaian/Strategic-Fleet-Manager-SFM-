import { describe, it, expect } from 'vitest'
import { generateRegistryFileContent } from '../registryGenerator'

describe('generateRegistryFileContent — EWO-038 (Task 8/11)', () => {
  it('is deterministic — the same input always produces byte-identical output', () => {
    const entries = [
      { registryKey: 'ghost', url: 'https://media.robertsspaceindustries.com/a/slideshow.jpg' },
      { registryKey: 'DRAK_Corsair', url: 'https://media.robertsspaceindustries.com/b/slideshow.jpg' },
    ]
    expect(generateRegistryFileContent(entries)).toBe(generateRegistryFileContent(entries))
  })

  it('sorts entries alphabetically by registry key regardless of input order', () => {
    const entries = [
      { registryKey: 'zeus', url: 'https://media.robertsspaceindustries.com/z/slideshow.jpg' },
      { registryKey: 'ghost', url: 'https://media.robertsspaceindustries.com/g/slideshow.jpg' },
      { registryKey: 'DRAK_Corsair', url: 'https://media.robertsspaceindustries.com/c/slideshow.jpg' },
    ]
    const content = generateRegistryFileContent(entries)
    const ghostIdx = content.indexOf('ghost:')
    const zeusIdx = content.indexOf('zeus:')
    const corsairIdx = content.indexOf('DRAK_Corsair:')
    expect(corsairIdx).toBeLessThan(ghostIdx)
    expect(ghostIdx).toBeLessThan(zeusIdx)
  })

  it('quotes a key that is not a bare JS identifier (starts with a digit)', () => {
    const content = generateRegistryFileContent([{ registryKey: '135c', url: 'https://media.robertsspaceindustries.com/x/slideshow.jpg' }])
    expect(content).toContain(`"135c":`)
  })

  it('does not quote a key that is a valid bare identifier', () => {
    const content = generateRegistryFileContent([{ registryKey: 'ghost', url: 'https://media.robertsspaceindustries.com/x/slideshow.jpg' }])
    expect(content).toContain('ghost:')
    expect(content).not.toContain('"ghost":')
  })

  it('never emits a blank entry', () => {
    const content = generateRegistryFileContent([{ registryKey: 'ghost', url: 'https://media.robertsspaceindustries.com/x/slideshow.jpg' }])
    expect(content).not.toMatch(/:\s*,/)
  })

  it('never emits a duplicate key', () => {
    const content = generateRegistryFileContent([
      { registryKey: 'ghost', url: 'https://media.robertsspaceindustries.com/x/slideshow.jpg' },
      { registryKey: 'ghost', url: 'https://media.robertsspaceindustries.com/y/slideshow.jpg' },
    ])
    const occurrences = content.match(/ghost:/g) ?? []
    expect(occurrences).toHaveLength(1)
  })

  it('produces syntactically valid TypeScript object literal content (parseable)', () => {
    const content = generateRegistryFileContent([
      { registryKey: 'ghost', url: 'https://media.robertsspaceindustries.com/x/slideshow.jpg' },
      { registryKey: '135c', url: 'https://media.robertsspaceindustries.com/y/slideshow.jpg' },
    ])
    // Extract just the object body and eval it as plain JS object syntax —
    // sufficient to catch a stray comma/quote bug without a full TS compile.
    const objectLiteral = content.slice(content.indexOf('{', content.indexOf('SHIP_IMAGE_URLS')))
    const parsed = new Function(`return ${objectLiteral.replace(/,\n}$/, '\n}')}`)()
    expect(parsed.ghost).toBe('https://media.robertsspaceindustries.com/x/slideshow.jpg')
    expect(parsed['135c']).toBe('https://media.robertsspaceindustries.com/y/slideshow.jpg')
  })
})
