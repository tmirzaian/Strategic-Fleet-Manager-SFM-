import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PriorityCard from '../PriorityCard'
import type { Ship } from '../../types'
import type { BuildProgressResult } from '../../utils/buildProgress'

afterEach(() => cleanup())

const baseShip: Ship = {
  id: 'ghost',
  name: 'F7C-S Hornet Ghost Mk II',
  manufacturer: 'Anvil',
  ownership: 'Owned',
  career: 'Combat',
  role: 'Stealth Fighter',
  activeBuildId: 'ghost-stealth',
  readiness: 82,
  priority: 1,
  missing: [],
}

const progress: BuildProgressResult = {
  percentage: 78,
  matchedAssignments: 6,
  requiredAssignments: 8,
  missingAssignments: ['Slipstream'],
  mismatchedAssignments: [],
  invalidTargets: [],
  upgradeOpportunities: [],
  unresolvedAssignments: [],
  isComplete: false,
  status: 'NEAR_READY',
}

describe('<PriorityCard /> — EWO-012 thin Mission Control wrapper', () => {
  it("7. adds only the PRIORITY N badge — no other Mission-Control-specific concept — on top of ShipRecordCard's rendering", () => {
    render(
      <MemoryRouter>
        <PriorityCard ship={baseShip} buildName="Stealth Build" rank={2} progress={progress} />
      </MemoryRouter>
    )
    expect(screen.getByText('PRIORITY 2')).toBeInTheDocument()
    expect(screen.getByText(baseShip.name)).toBeInTheDocument()
    expect(screen.getByText('Ship Detail')).toBeInTheDocument()
  })
})
