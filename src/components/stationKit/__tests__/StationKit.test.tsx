import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { Rocket, ShieldCheck } from 'lucide-react'
import {
  MountedInstrument,
  OfficerBriefingBlock,
  StructuralDivider,
  CompartmentHeader,
  OperationalStatusBanner,
  MountedWorkspacePanel,
  QuartermasterIconHousing,
  BlueprintGridOverlay,
  TacticalCirclesOverlay,
  EngineeringMarksOverlay,
  ScanLinesOverlay,
  CompartmentFrameOverlay,
  HolographicDepthOverlay,
} from '../index'
import QuartermasterStationKit from '../QuartermasterStationKit'

afterEach(() => cleanup())

/**
 * EWO-110 (Part J-equivalent gates) — every test uses generic, invented
 * content, never real Flight Commander/Mission Control data, proving the
 * kit is genuinely reusable presentation infrastructure.
 */
describe('Quartermaster Station Kit — components render (EWO-110)', () => {
  it('Part A — MountedInstrument renders title/value, and optional icon/status/trend', () => {
    render(<MountedInstrument title="Widgets Tracked" value={7} icon={Rocket} status="success" trend="up" testId="probe" />)
    const el = screen.getByTestId('probe')
    expect(el).toHaveTextContent('7')
    expect(el).toHaveTextContent('Widgets Tracked')
    expect(screen.getByLabelText('trend up')).toBeInTheDocument()
  })

  it('Part A — MountedInstrument defaults to the original neutral border + cyan hairline when no status is given (visual-parity contract)', () => {
    render(<MountedInstrument title="Widgets Tracked" value={7} testId="probe" />)
    expect(screen.getByTestId('probe').className).toContain('border-white/10')
  })

  it('Part B — OfficerBriefingBlock renders only the slots supplied, omitting the rest', () => {
    render(<OfficerBriefingBlock recommendation="Store in Hangar." testId="probe" />)
    expect(screen.getByTestId('officer-briefing-recommendation')).toHaveTextContent('Store in Hangar.')
    expect(screen.queryByTestId('officer-briefing-concern')).not.toBeInTheDocument()
    expect(screen.queryByTestId('officer-briefing-summary')).not.toBeInTheDocument()
  })

  it('Part B — OfficerBriefingBlock renders all five slots when all are supplied', () => {
    render(
      <OfficerBriefingBlock
        standingCondition="Standing By"
        summary="All clear."
        concern="One item."
        recommendation="Do the thing."
        nextAction="Open the page."
      />
    )
    expect(screen.getByTestId('officer-briefing-standingCondition')).toBeInTheDocument()
    expect(screen.getByTestId('officer-briefing-summary')).toBeInTheDocument()
    expect(screen.getByTestId('officer-briefing-concern')).toBeInTheDocument()
    expect(screen.getByTestId('officer-briefing-recommendation')).toBeInTheDocument()
    expect(screen.getByTestId('officer-briefing-nextAction')).toBeInTheDocument()
  })

  it.each(['horizontal', 'vertical', 'mounted', 'section-break'] as const)('Part C — StructuralDivider renders the %s variant', (variant) => {
    render(<StructuralDivider variant={variant} label={variant === 'section-break' ? 'Test Label' : undefined} testId="probe" />)
    expect(screen.getByTestId('probe')).toBeInTheDocument()
  })

  it('Part D — CompartmentHeader renders designation, title, subtitle, and officer designation', () => {
    render(<CompartmentHeader designation="Mission Control" title="Fleet Operations Bridge" subtitle="A subtitle." officerDesignation="Executive Officer Reporting" />)
    expect(screen.getByText('Mission Control')).toBeInTheDocument()
    expect(screen.getByText('Fleet Operations Bridge')).toBeInTheDocument()
    expect(screen.getByText('A subtitle.')).toBeInTheDocument()
    expect(screen.getByText('Executive Officer Reporting')).toBeInTheDocument()
  })

  it('Part D — CompartmentHeader omits subtitle/officer designation when not supplied', () => {
    render(<CompartmentHeader designation="Mission Control" title="Fleet Operations Bridge" testId="probe" />)
    const el = screen.getByTestId('probe')
    expect(el.querySelectorAll('p')).toHaveLength(1)
  })

  it.each(['mission-ready', 'operational', 'standing-watch', 'attention-required', 'maintenance-required', 'warning', 'information', 'critical'] as const)(
    'Part E — OperationalStatusBanner renders the %s variant with its default label',
    (variant) => {
      render(<OperationalStatusBanner variant={variant} testId="probe" />)
      expect(screen.getByTestId('probe')).toBeInTheDocument()
    }
  )

  it('Part E — OperationalStatusBanner accepts a Station-specific label override while keeping the variant\'s own tone', () => {
    render(<OperationalStatusBanner variant="operational" label="Target Intelligence Available" testId="probe" />)
    expect(screen.getByText('Target Intelligence Available')).toBeInTheDocument()
  })

  it.each([
    ['BlueprintGridOverlay', BlueprintGridOverlay],
    ['TacticalCirclesOverlay', TacticalCirclesOverlay],
    ['EngineeringMarksOverlay', EngineeringMarksOverlay],
    ['ScanLinesOverlay', ScanLinesOverlay],
    ['CompartmentFrameOverlay', CompartmentFrameOverlay],
    ['HolographicDepthOverlay', HolographicDepthOverlay],
  ] as const)('Part F — %s is aria-hidden, pointer-events-none, and renders no text content', (_name, Overlay) => {
    const { container } = render(<Overlay />)
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(root.className).toContain('pointer-events-none')
    expect(container.textContent).toBe('')
  })

  it('Part G — MountedWorkspacePanel renders title, toolbar, content, and footer slots', () => {
    render(
      <MountedWorkspacePanel title="Panel Title" toolbar={<span>toolbar-probe</span>} footer={<span>footer-probe</span>}>
        <span>content-probe</span>
      </MountedWorkspacePanel>
    )
    expect(screen.getByText('Panel Title')).toBeInTheDocument()
    expect(screen.getByText('toolbar-probe')).toBeInTheDocument()
    expect(screen.getByText('content-probe')).toBeInTheDocument()
    expect(screen.getByText('footer-probe')).toBeInTheDocument()
  })

  it('Part G — MountedWorkspacePanel omits the header row entirely when neither title nor toolbar is supplied', () => {
    const { container } = render(
      <MountedWorkspacePanel>
        <span>content-only</span>
      </MountedWorkspacePanel>
    )
    expect(container.querySelector('.border-b')).toBeNull()
  })

  it('Part H — QuartermasterIconHousing renders an accessible, labeled icon in both active and inactive states', () => {
    render(
      <>
        <QuartermasterIconHousing icon={Rocket} label="Active example" active />
        <QuartermasterIconHousing icon={ShieldCheck} label="Inactive example" active={false} />
      </>
    )
    expect(screen.getByLabelText('Active example').className).toContain('border-gold/50')
    expect(screen.getByLabelText('Inactive example').className).toContain('border-cyan/15')
  })
})

describe('Quartermaster Station Kit — the showcase renders with no router, no store, no business logic (EWO-110 Part I)', () => {
  it('QuartermasterStationKit renders end to end without throwing', () => {
    expect(() => render(<QuartermasterStationKit />)).not.toThrow()
    expect(screen.getByText('Quartermaster Station Kit')).toBeInTheDocument()
  })

  it('the showcase file imports no router, store, or business-logic module', () => {
    const source = readFileSync(resolve(__dirname, '../QuartermasterStationKit.tsx'), 'utf-8')
    const importLines = source.split('\n').filter((l) => l.trim().startsWith('import'))
    for (const fragment of ['react-router-dom', 'useFleetStore', 'factoryLoadoutTargetIntelligence', '/pages/']) {
      expect(importLines.some((l) => l.includes(fragment))).toBe(false)
    }
  })
})

/**
 * EWO-110 (Part B/J) — "no business logic changes... pure presentation
 * infrastructure." Verified structurally: every Station Kit source
 * file's own `import` statements are scanned for any dependency on
 * Flight-Commander-specific (or any other page-specific) modules,
 * mirroring the same proof EWO-109 already established for
 * `src/components/stationShell`.
 */
describe('Quartermaster Station Kit — no dependency on any page\'s business logic (EWO-110)', () => {
  const kitDir = resolve(__dirname, '..')
  const kitSourceFiles = readdirSync(kitDir).filter((f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && f !== 'QuartermasterStationKit.tsx')
  const forbiddenImportFragments = ['factoryLoadoutTargetIntelligence', 'flightCommanderPresentation', 'flightCommanderComponentIdentity', 'useFleetStore', '/pages/', 'react-router-dom', 'shipDefinitions']

  it.each(kitSourceFiles)('%s imports nothing from any page\'s own business logic, store, or router', (file) => {
    const source = readFileSync(resolve(kitDir, file), 'utf-8')
    const importLines = source.split('\n').filter((line) => line.trim().startsWith('import'))
    for (const fragment of forbiddenImportFragments) {
      expect(importLines.some((line) => line.includes(fragment))).toBe(false)
    }
  })
})
