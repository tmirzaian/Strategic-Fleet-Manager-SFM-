import type { QuartermasterTemplate } from '../types'

/**
 * Quartermaster Templates (Alpha 2.2) — reusable mission intent, not tied
 * to any specific Fleet Asset. Migrated from Build Manager's previous
 * mock "Build Library" list into real, store-backed records. Applying one
 * to a Fleet Asset (via the Mission Composer) creates or updates a real,
 * ship-specific Mission Configuration — the template itself is never an
 * activeBuildId.
 */
const seededAt = '2026-01-01T00:00:00.000Z'

export const seedQuartermasterTemplates: QuartermasterTemplate[] = [
  {
    id: 'template-stealth-recon',
    name: 'Stealth Recon',
    description: 'Minimal signature, sensor-focused loadout for scouting.',
    category: 'Combat',
    targetAssignments: [
      { slotLabel: 'Left Wing Weapon (Gimbal Mount)', targetItem: 'Bulldog Repeater' },
      { slotLabel: 'Right Wing Weapon (Gimbal Mount)', targetItem: 'Bulldog Repeater' },
      { slotLabel: 'Left Shield Generator', targetItem: 'FR-66' },
      { slotLabel: 'Radar', targetItem: 'Bloodhound' },
    ],
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  {
    id: 'template-escort-support',
    name: 'Escort / Close Support',
    description: 'Balanced weapons and shields for protecting a group.',
    category: 'Combat',
    targetAssignments: [
      { slotLabel: 'Left Wing Weapon (Gimbal Mount)', targetItem: 'Mass Driver' },
      { slotLabel: 'Right Wing Weapon (Gimbal Mount)', targetItem: 'Mass Driver' },
      { slotLabel: 'Left Shield Generator', targetItem: 'FR-66' },
      { slotLabel: 'Right Shield Generator', targetItem: 'FR-66' },
    ],
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  {
    id: 'template-mining-standard',
    name: 'Standard Mining Loadout',
    description: 'Stock mining laser and modules for solo/small-group mining.',
    category: 'Industrial',
    targetAssignments: [{ slotLabel: 'Front Cab Mining Laser (Manned Turret) — Mining Weapon', targetItem: 'Helix I' }],
    createdAt: seededAt,
    updatedAt: seededAt,
  },
  {
    id: 'template-medical-rescue',
    name: 'Medical / Rescue Support',
    description: 'Life-support and shield-focused loadout for rescue operations.',
    category: 'Support',
    targetAssignments: [
      { slotLabel: 'Right Shield Generator', targetItem: 'FR-66' },
      { slotLabel: 'Life Support', targetItem: 'Vector LS-4' },
    ],
    createdAt: seededAt,
    updatedAt: seededAt,
  },
]
