/**
 * Public entry point for the typed asset infrastructure (Mission M-022).
 * Application code should import from here rather than reaching into the
 * individual files directly.
 */
export * from './types'
export { assetPath } from './assetPaths'
export { ENVIRONMENT_ASSETS, getEnvironmentDefinition, isEnvironmentUsable, resolveResponsiveSource, isValidPresentation, validateEnvironmentRegistry } from './environmentAssets'
export { BRANDING_ASSETS, getBrandingAsset, resolveBrandingSrc } from './brandingAssets'
export { resolveFleetRegistryImage, manufacturerSlugForCode, FLEET_REGISTRY_PLACEHOLDER, type ResolveFleetRegistryImageParams } from './fleetRegistryAssets'
export { WORKFLOW_ILLUSTRATIONS, getWorkflowIllustration, resolveWorkflowIllustration } from './workflowAssets'
export { SHIP_MANAGEMENT_ILLUSTRATIONS, getShipManagementIllustration, resolveShipManagementIllustration } from './shipManagementAssets'
export { CAPTAINS_LOG_ACCENTS, getCaptainsLogAccent, resolveCaptainsLogAccentSource } from './captainsLogAssets'
export { SHIP_MANAGEMENT_CARD_ACCENTS, getShipManagementCardAccent, resolveShipManagementCardAccentSource } from './shipManagementCardAccents'
export { CERTIFICATION_BADGES, getCertificationBadge, resolveCertificationBadgeSrc } from './certificationBadgeAssets'
