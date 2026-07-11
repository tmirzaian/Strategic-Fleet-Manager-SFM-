import type { FleetAsset } from '../types'
import { ships as seedShips } from './seed'
import { legacyToOwnershipType } from '../utils/ownership'

/**
 * Migrates the existing seed fleet (previously the only source of truth
 * for "what ships exist") into real FleetAsset records, one per seed
 * ship, preserving current demo behavior exactly: same ids, same active
 * build, same priority, same ownership. `acquisitionSource:
 * 'SEED_MIGRATION'` distinguishes these from ships added later via the
 * Add Ship workflow (`'MANUAL'`) — see src/store/useFleetStore.ts, which
 * only persists non-SEED_MIGRATION assets to localStorage, since the
 * seed fleet is reconstructed fresh from src/data/seed.ts on every load
 * and never needs to round-trip through storage itself.
 */
export function migrateSeedFleetToAssets(): FleetAsset[] {
  const migratedAt = '2026-01-01T00:00:00.000Z'
  return seedShips.map((s): FleetAsset => ({
    id: `${s.id}-asset-seed`,
    shipDefinitionId: s.id,
    ownershipType: legacyToOwnershipType(s.ownership),
    acquisitionSource: 'SEED_MIGRATION',
    activeBuildId: s.activeBuildId,
    installedLoadoutId: `${s.id}-asset-seed-installed`,
    priority: s.priority,
    status: 'active',
    addedAt: migratedAt,
    updatedAt: migratedAt,
  }))
}
