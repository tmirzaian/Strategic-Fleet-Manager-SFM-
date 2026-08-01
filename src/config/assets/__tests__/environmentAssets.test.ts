import { describe, it, expect } from 'vitest'
import { ENVIRONMENT_IDS } from '../types'
import { ENVIRONMENT_ASSETS, getEnvironmentDefinition, isEnvironmentUsable, resolveResponsiveSource, isValidPresentation, validateEnvironmentRegistry } from '../environmentAssets'

describe('Mission M-022: environment registry', () => {
  it('3. environment IDs are unique', () => {
    expect(new Set(ENVIRONMENT_IDS).size).toBe(ENVIRONMENT_IDS.length)
  })

  it('3. every registry key matches its own definition.id (no accidental cross-assignment)', () => {
    for (const id of ENVIRONMENT_IDS) {
      expect(ENVIRONMENT_ASSETS[id].id).toBe(id)
    }
  })

  it('4. every environment definition validates', () => {
    expect(validateEnvironmentRegistry()).toEqual([])
  })

  it('4. isValidPresentation rejects out-of-range values', () => {
    const base = { opacity: 0.2, brightness: 1, contrast: 1, saturation: 1, blurPx: 0, position: 'center' }
    expect(isValidPresentation(base)).toBe(true)
    expect(isValidPresentation({ ...base, opacity: -0.1 })).toBe(false)
    expect(isValidPresentation({ ...base, opacity: 1.1 })).toBe(false)
    expect(isValidPresentation({ ...base, brightness: 0 })).toBe(false)
    expect(isValidPresentation({ ...base, contrast: -1 })).toBe(false)
    expect(isValidPresentation({ ...base, saturation: -1 })).toBe(false)
    expect(isValidPresentation({ ...base, blurPx: -1 })).toBe(false)
    expect(isValidPresentation({ ...base, position: '' })).toBe(false)
  })

  const ENABLED_IDS = new Set(['mission-control', 'decision-center', 'mission-control-empty-priority', 'fleet-dashboard-empty', 'hangar-inventory-empty'])

  it('every definition outside the enabled set ships disabled with no artwork referenced (Mission M-022 is infrastructure only; EWO-035 enabled Mission Control, UX-003B enabled Decision Center, Chief Architect Asset Handoff enabled the three empty-state ids)', () => {
    for (const id of ENVIRONMENT_IDS) {
      if (ENABLED_IDS.has(id)) continue
      const def = getEnvironmentDefinition(id)
      expect(def.enabled).toBe(false)
      expect(isEnvironmentUsable(def)).toBe(false)
    }
  })

  it.each(['mission-control-empty-priority', 'fleet-dashboard-empty', 'hangar-inventory-empty'] as const)(
    'Chief Architect Asset Handoff (Revision 2): %s is enabled with real, usable tablet (~1920) and mobile (~1280) sources from the 3344x1882 master — desktop/desktop4k deliberately unpopulated this round (explicit product scope, not an upscale limit)',
    (id) => {
      const def = getEnvironmentDefinition(id)
      expect(def.enabled).toBe(true)
      expect(isEnvironmentUsable(def)).toBe(true)
      expect(def.sources.tablet).toMatch(/^\/assets\/environments\/.+-1920\.webp$/)
      expect(def.sources.mobile).toMatch(/^\/assets\/environments\/.+-1280\.webp$/)
      expect(def.sources.desktop4k).toBeUndefined()
      expect(def.sources.desktop).toBeUndefined()
      expect(isValidPresentation(def.presentation)).toBe(true)
    }
  )

  it.each(['mission-control-empty-priority', 'fleet-dashboard-empty', 'hangar-inventory-empty'] as const)(
    'Chief Architect Asset Handoff (Revision 2): %s presentation has zero blur — tuned crisp against the new higher-resolution master, no softening needed',
    (id) => {
      expect(getEnvironmentDefinition(id).presentation.blurPx).toBe(0)
    }
  )

  it('resolveResponsiveSource prefers the new tablet (1920) tier over mobile (1280) for the empty-state environments', () => {
    const def = getEnvironmentDefinition('mission-control-empty-priority')
    expect(resolveResponsiveSource(def.sources)).toBe(def.sources.tablet)
  })

  it('EWO-035: mission-control is enabled with a real, usable Beta artwork source', () => {
    const def = getEnvironmentDefinition('mission-control')
    expect(def.enabled).toBe(true)
    expect(isEnvironmentUsable(def)).toBe(true)
    expect(def.sources.desktop).toBe('/assets/environments/mission-control/mission-control-operations-wall.webp')
  })

  it('UX-003B: decision-center is enabled with a real, usable Commander-supplied artwork source', () => {
    const def = getEnvironmentDefinition('decision-center')
    expect(def.enabled).toBe(true)
    expect(isEnvironmentUsable(def)).toBe(true)
    expect(def.sources.desktop).toBe('/assets/environments/decision-center/decision-center.webp')
  })

  it('EWO-035A: mission-control presentation is tuned brighter/more visible than the shared dormant default, and still validates', () => {
    const def = getEnvironmentDefinition('mission-control')
    expect(def.presentation.opacity).toBeGreaterThan(0.16)
    expect(def.presentation.brightness).toBeGreaterThan(0.7)
    expect(isValidPresentation(def.presentation)).toBe(true)
  })

  it('EWO-035A-R2: mission-control presentation renders the artwork at full strength — opacity/brightness/contrast/saturation all neutral (1.0), per Commander-approved final visual review', () => {
    const def = getEnvironmentDefinition('mission-control')
    expect(def.presentation.opacity).toBe(1.0)
    expect(def.presentation.brightness).toBe(1.0)
    expect(def.presentation.contrast).toBe(1.0)
    expect(def.presentation.saturation).toBe(1.0)
    expect(isValidPresentation(def.presentation)).toBe(true)
  })

  it('resolveResponsiveSource prefers the widest available source', () => {
    expect(resolveResponsiveSource({ desktop4k: 'a', desktop: 'b', tablet: 'c', mobile: 'd' })).toBe('a')
    expect(resolveResponsiveSource({ desktop: 'b', tablet: 'c' })).toBe('b')
    expect(resolveResponsiveSource({ mobile: 'd' })).toBe('d')
  })

  it('6. resolveResponsiveSource returns undefined for a fully empty source set — never throws', () => {
    expect(resolveResponsiveSource({})).toBeUndefined()
  })
})
