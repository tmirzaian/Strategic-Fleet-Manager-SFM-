import { describe, it, expect, beforeEach } from 'vitest'
import { useFleetStore } from '../useFleetStore'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})

describe('Mission Context installs (Golden Scenario F, Alpha 2.2 shared Installed Loadout)', () => {
  it('30. Mission Context selection alone never changes activeBuildId', () => {
    const ghostBefore = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    expect(ghostBefore.activeBuildId).toBe('ghost-stealth')

    useFleetStore.getState().installComponent('ghost', 'FR-66', 'Left Shield Generator', 'ghost-escort')

    const ghostAfter = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    expect(ghostAfter.activeBuildId).toBe('ghost-stealth')
  })

  it('31. installing FR-66 under the Escort Mission context physically changes the shared Installed Loadout for that slot', () => {
    const escortShieldBefore = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-escort' && h.slotLabel === 'Left Shield Generator')!
    expect(escortShieldBefore.installedItem).toBe('Mirage')

    const result = useFleetStore.getState().installComponent('ghost', 'FR-66', 'Left Shield Generator', 'ghost-escort')
    expect(result.matched).toBe(true)

    const escortShieldAfter = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-escort' && h.slotLabel === 'Left Shield Generator')!
    expect(escortShieldAfter.installedItem).toBe('FR-66')
    expect(escortShieldAfter.status).toBe('OK')
  })

  it('32 (Alpha 2.2 fix): installing under a non-active Mission context updates Installed for EVERY Mission sharing that slot, since Installed Loadout is real shared physical state — this is the bug this sprint fixes, not a regression', () => {
    const stealthShieldBefore = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-stealth' && h.slotLabel === 'Left Shield Generator')!
    expect(stealthShieldBefore.installedItem).toBe('Mirage')
    expect(stealthShieldBefore.status).toBe('OK') // Stealth's target is also Mirage — matched before the install.

    const stealthReadinessBefore = useFleetStore.getState().builds.find((b) => b.id === 'ghost-stealth')!.readiness
    const escortReadinessBefore = useFleetStore.getState().builds.find((b) => b.id === 'ghost-escort')!.readiness

    useFleetStore.getState().installComponent('ghost', 'FR-66', 'Left Shield Generator', 'ghost-escort')

    // Escort's own target (FR-66) is now matched — its readiness improves.
    const escortReadinessAfter = useFleetStore.getState().builds.find((b) => b.id === 'ghost-escort')!.readiness
    expect(escortReadinessAfter).toBeGreaterThan(escortReadinessBefore)

    // Stealth's Shield 1 physically holds FR-66 now too (shared reality),
    // which no longer matches Stealth's own target (Mirage) — Stealth's
    // readiness correctly reflects that, rather than staying artificially
    // frozen on stale "Mirage installed" data.
    const stealthShieldAfter = useFleetStore.getState().hardpoints.find((h) => h.buildId === 'ghost-stealth' && h.slotLabel === 'Left Shield Generator')!
    expect(stealthShieldAfter.installedItem).toBe('FR-66')
    expect(stealthShieldAfter.status).not.toBe('OK')
    const stealthReadinessAfter = useFleetStore.getState().builds.find((b) => b.id === 'ghost-stealth')!.readiness
    expect(stealthReadinessAfter).toBeLessThan(stealthReadinessBefore)
  })

  it('33 (Alpha 2.2 fix): the Active Mission selection itself is unaffected — Fleet Dashboard keeps showing Stealth as active — but its displayed readiness correctly follows the real shared Installed state', () => {
    useFleetStore.getState().installComponent('ghost', 'FR-66', 'Left Shield Generator', 'ghost-escort')

    const ghost = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!
    expect(ghost.activeBuildId).toBe('ghost-stealth') // still Stealth, never silently switched to Escort

    const stealthBuild = useFleetStore.getState().builds.find((b) => b.id === 'ghost-stealth')!
    expect(ghost.readiness).toBe(stealthBuild.readiness) // dashboard cache matches the (now-correct) active Mission's own readiness
  })

  it('installing under the active Mission context updates the ship-facing cache exactly as before', () => {
    const before = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!.readiness
    useFleetStore.getState().installComponent('ghost', 'Slipstream', 'Power Plant', 'ghost-stealth')
    const after = useFleetStore.getState().ships.find((s) => s.id === 'ghost')!.readiness
    expect(after).toBeGreaterThan(before)
  })

  it('a shared InstalledLoadout entry exists and reflects the latest physical install for the slot', () => {
    useFleetStore.getState().installComponent('ghost', 'FR-66', 'Left Shield Generator', 'ghost-escort')
    const entry = useFleetStore.getState().installedLoadouts.find((e) => e.shipId === 'ghost' && e.slotLabel === 'Left Shield Generator')
    expect(entry?.installedItem).toBe('FR-66')
  })
})
