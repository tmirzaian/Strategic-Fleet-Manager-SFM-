export interface WorkbookRow {
  rowNumber: number
  name: string
  url: string
}

export type CoverageStatus = 'REGISTRY' | 'FALLBACK' | 'REVIEW_REQUIRED'
export type MaintenanceMatchMethod = 'EXACT_NAME' | 'NORMALIZED_NAME' | 'EXISTING_ALIAS' | 'MANUAL_REVIEW' | 'UNMATCHED'

export interface MaintenanceCsvRow {
  manufacturer: string
  ship_name: string
  canonical_id: string
  source_entity_class: string
  rsi_image_url: string
  coverage_status: CoverageStatus
  match_method: MaintenanceMatchMethod
  notes: string
}

export const MAINTENANCE_CSV_HEADER = [
  'manufacturer',
  'ship_name',
  'canonical_id',
  'source_entity_class',
  'rsi_image_url',
  'coverage_status',
  'match_method',
  'notes',
] as const
