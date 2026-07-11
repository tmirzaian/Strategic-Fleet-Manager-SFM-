/**
 * Local fallback ship image — always available, never a broken-image
 * icon, no RSI/CIG branding. Used whenever no remote image is known, or
 * whenever a remote image URL fails to load (see src/components/ShipImage.tsx).
 */
export const SHIP_PLACEHOLDER_URL = '/images/ship-placeholder.png'

/**
 * Product-facing alias for the same asset (Sprint 1.3I) — "Data Link
 * Pending" is the agreed term shown to players when a ship has no
 * resolved image yet (e.g. a freshly-added Fleet Asset for an imported
 * ship definition). Deliberately a separate named export rather than a
 * rename of SHIP_PLACEHOLDER_URL, which existing fallback/error-handling
 * code already depends on — see src/utils/shipImageState.ts.
 */
export const DATA_LINK_PENDING_IMAGE_URL = SHIP_PLACEHOLDER_URL
export const DATA_LINK_PENDING_LABEL = 'Data Link Pending'
