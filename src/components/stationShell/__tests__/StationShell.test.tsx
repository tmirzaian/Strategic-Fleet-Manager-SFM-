import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  StationShell,
  StationEnvironmentMount,
  StationBriefingRegion,
  MountedInstrumentRegion,
  OperationalRailMount,
  PrimaryWorkspace,
  SupportingWorkspace,
  StandingReportRegion,
} from '../index'
import { MountedInstrument } from '../../stationKit'

/**
 * EWO-109 (Part J) — every test here uses generic, invented content
 * ("Test Station," "Widgets Tracked," a fake `EnvironmentId`) rather than
 * any real Flight Commander data, specifically to prove the shell has no
 * dependency on Flight Commander's own business logic — a page importing
 * from `src/components/stationShell` should never need to know
 * `resolveFactoryLoadoutTargetIntelligence` exists.
 */
describe('Quartermaster Station Shell — structural regions render (EWO-109 Part J)', () => {
  it('StationShell renders its children inside the compartment threshold wrapper', () => {
    render(
      <StationShell>
        <div data-testid="probe">probe content</div>
      </StationShell>
    )
    expect(screen.getByTestId('probe')).toBeInTheDocument()
  })

  it('StationEnvironmentMount renders the environment layer for any valid EnvironmentId, not just flight-commander', () => {
    const { container } = render(<StationEnvironmentMount environmentId="mission-control" />)
    expect(container.querySelector('[data-environment-id="mission-control"]')).not.toBeNull()
    expect(screen.getByTestId('station-environment-mount')).toBeInTheDocument()
  })

  it('StationEnvironmentMount renders arbitrary children inside the mount', () => {
    render(
      <StationEnvironmentMount environmentId="mission-control">
        <div data-testid="briefing-probe">briefing content</div>
      </StationEnvironmentMount>
    )
    expect(screen.getByTestId('briefing-probe')).toBeInTheDocument()
  })

  it('EWO-114: StationEnvironmentMount renders an optional secondaryRail after its own auto-filling spacer, for a two-rail Station shape (e.g. Mission Control) — omitting it stays byte-identical to the original one-rail shape (Flight Commander)', () => {
    const { container } = render(
      <StationEnvironmentMount environmentId="mission-control" secondaryRail={<div data-testid="secondary-rail-probe">secondary content</div>}>
        <div data-testid="primary-rail-probe">primary content</div>
      </StationEnvironmentMount>
    )
    expect(screen.getByTestId('primary-rail-probe')).toBeInTheDocument()
    expect(screen.getByTestId('secondary-rail-probe')).toBeInTheDocument()
    const mount = container.querySelector('[data-testid="station-environment-mount"]') as HTMLElement
    const primary = screen.getByTestId('primary-rail-probe')
    const secondary = screen.getByTestId('secondary-rail-probe')
    // The auto-filling open-window spacer must sit between the two rails,
    // not disappear or relocate to either end.
    expect(primary.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const spacer = Array.from(mount.children).find((el) => el.getAttribute('aria-hidden') === 'true' && el.className.includes('flex-1'))
    expect(spacer).not.toBeUndefined()
    expect(primary.compareDocumentPosition(spacer!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(spacer!.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('StationBriefingRegion renders its children with no knowledge of what they are', () => {
    render(
      <StationBriefingRegion>
        <p data-testid="identity-probe">Test Station — Standing By</p>
      </StationBriefingRegion>
    )
    expect(screen.getByTestId('identity-probe')).toBeInTheDocument()
  })

  it('MountedInstrumentRegion + the Station Kit MountedInstrument render generic title/value pairs', () => {
    render(
      <MountedInstrumentRegion>
        <MountedInstrument title="Widgets Tracked" value={7} testId="instrument-widgets" />
        <MountedInstrument title="Gizmos Ready" value="N/A" testId="instrument-gizmos" />
      </MountedInstrumentRegion>
    )
    expect(screen.getByTestId('summary-cards')).toBeInTheDocument()
    expect(screen.getByTestId('instrument-widgets')).toHaveTextContent('7')
    expect(screen.getByTestId('instrument-widgets')).toHaveTextContent('Widgets Tracked')
    expect(screen.getByTestId('instrument-gizmos')).toHaveTextContent('N/A')
  })

  it('OperationalRailMount (Operational Control Rail slot) renders arbitrary control content', () => {
    render(
      <OperationalRailMount>
        <input aria-label="Test filter" />
      </OperationalRailMount>
    )
    expect(screen.getByTestId('operational-rail-mount')).toBeInTheDocument()
    expect(screen.getByLabelText('Test filter')).toBeInTheDocument()
  })

  it('PrimaryWorkspace (workspace slot) renders arbitrary workspace content', () => {
    render(
      <PrimaryWorkspace>
        <table>
          <tbody>
            <tr>
              <td>row</td>
            </tr>
          </tbody>
        </table>
      </PrimaryWorkspace>
    )
    expect(screen.getByTestId('primary-workspace')).toBeInTheDocument()
    expect(screen.getByText('row')).toBeInTheDocument()
  })

  it('SupportingWorkspace (reference intelligence slot) renders arbitrary supporting content', () => {
    render(
      <SupportingWorkspace>
        <p>reference detail</p>
      </SupportingWorkspace>
    )
    expect(screen.getByTestId('supporting-workspace')).toBeInTheDocument()
    expect(screen.getByText('reference detail')).toBeInTheDocument()
  })

  it('StandingReportRegion (Standing Report slot) renders arbitrary Station copy, with the monitoring visual present by default', () => {
    const { container } = render(
      <StandingReportRegion testId="test-standing-report">
        <p>Nothing outstanding.</p>
      </StandingReportRegion>
    )
    expect(screen.getByTestId('test-standing-report')).toBeInTheDocument()
    expect(screen.getByText('Nothing outstanding.')).toBeInTheDocument()
    expect(container.querySelector('.animate-radar-sweep')).not.toBeNull()
  })

  it('StandingReportRegion can opt out of the monitoring visual for a Station whose domain has no sweep metaphor', () => {
    const { container } = render(
      <StandingReportRegion testId="test-standing-report" monitoringVisual={false}>
        <p>Nothing outstanding.</p>
      </StandingReportRegion>
    )
    expect(container.querySelector('.animate-radar-sweep')).toBeNull()
  })
})

describe('Quartermaster Station Shell — accessibility (EWO-109 Part J)', () => {
  it('the environment layer and its negative-space spacer are aria-hidden, never announced to assistive tech', () => {
    const { container } = render(<StationEnvironmentMount environmentId="mission-control" />)
    const envLayer = container.querySelector('[data-environment-id="mission-control"]')
    expect(envLayer).toHaveAttribute('aria-hidden', 'true')
  })

  it('the Standing Report monitoring visual is aria-hidden, purely decorative', () => {
    const { container } = render(
      <StandingReportRegion>
        <p>content</p>
      </StandingReportRegion>
    )
    const sweepAncestor = container.querySelector('.animate-radar-sweep')?.closest('[aria-hidden="true"]')
    expect(sweepAncestor).not.toBeNull()
  })
})

/**
 * EWO-109 (Part B/J) — "the shell must not know anything about ships,
 * readiness, inventory, procurement, intelligence, maintenance, history,
 * or reservations." Verified structurally, not by convention: every
 * shell source file's own import statements are scanned for any
 * dependency on Flight-Commander-specific modules. A prose comment
 * *explaining* the rule (e.g. this file's own doc comments) is not a
 * violation — only a real `import` from Flight Commander's own utils,
 * store, or page directory would be.
 */
describe('Quartermaster Station Shell — no dependency on Flight Commander business logic (EWO-109 Part B/H/J)', () => {
  const shellDir = resolve(__dirname, '..')
  const shellSourceFiles = readdirSync(shellDir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  const forbiddenImportFragments = ['factoryLoadoutTargetIntelligence', 'flightCommanderPresentation', 'flightCommanderComponentIdentity', 'useFleetStore', '/pages/flightCommander', "'../../pages/", 'shipDefinitions']

  it.each(shellSourceFiles)('%s imports nothing from Flight Commander\'s own business logic, store, or page tree', (file) => {
    const source = readFileSync(resolve(shellDir, file), 'utf-8')
    const importLines = source.split('\n').filter((line) => line.trim().startsWith('import'))
    for (const fragment of forbiddenImportFragments) {
      expect(importLines.some((line) => line.includes(fragment))).toBe(false)
    }
  })
})
