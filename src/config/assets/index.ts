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
