/**
 * SW-010A (Objective 3) — Canonical Merge Stage.
 *
 * Implements ImportPipeline-v2.md's Stage 9 merge algorithm: combines the
 * existing Physical Port Graph (Authority 1, minimally represented here
 * as `PhysicalPortFact[]` — see types.ts for why this module doesn't
 * import the real `Hardpoint`/`Port` types directly), the Default
 * Loadout Extractor's output (Authority 2, Objective 1), and resolved
 * Swap Groups (Authority 3, Objective 2) into one
 * `CanonicalConfigurableTopology`.
 *
 * Pure — no I/O, no StarBreaker access. Every entity-class reference this
 * module consumes is already resolved by the caller (see the module doc
 * comment in `defaultLoadoutExtractor.ts` and
 * `scripts/generateConfigurableSlotReport.ts` for why reference
 * resolution is deliberately kept out of this pure pipeline).
 */
import type { CanonicalConfigurableTopology, ConfigurableSlot, DefaultLoadoutConfigurationEntry, MergeDiagnostic, PhysicalPortFact, SwapGroup } from './types'

export interface ResolvedConfigurationEntry {
  entry: DefaultLoadoutConfigurationEntry
  /** The entry's factory default, fully resolved to a real entity class —
   * either `entry.factoryEntityClassName` verbatim, or the caller's own
   * resolution of `entry.factoryEntityClassReference` (see
   * `defaultLoadoutExtractor.ts`'s doc comment). `null` when neither is
   * available or resolvable — the entry is still merged, just with no
   * swap-group lookup performed for it. */
  resolvedDefaultEntityClass: string | null
}

export interface MergeInput {
  shipEntityClass: string
  physicalPorts: PhysicalPortFact[]
  configurationEntries: ResolvedConfigurationEntry[]
  /** Provided by the caller (typically `swapGroupResolver.ts`'s
   * `resolveSwapGroup`, invoked once per distinct resolved default entity
   * class) — this module never resolves swap groups itself, it only
   * consumes already-resolved results, keeping merge and resolution
   * independently testable. */
  resolveSwapGroupFor: (defaultEntityClass: string) => SwapGroup | null
  /** Localization lookup for `port_NameConfigurableSlot`-style keys — see
   * `ADR-014`'s confirmed real, generic localization key. Optional: a
   * caller with no localization table available still gets a fully
   * correct merge, just with `localizedSlotName: null`. */
  resolveLocalizedSlotName?: (itemPortName: string) => string | null
}

function buildSlot(entry: DefaultLoadoutConfigurationEntry, resolvedDefaultEntityClass: string | null, input: MergeInput, sourceAuthority: ConfigurableSlot['sourceAuthority']): ConfigurableSlot {
  const swapGroup = resolvedDefaultEntityClass ? input.resolveSwapGroupFor(resolvedDefaultEntityClass) : null
  const localizedSlotName = input.resolveLocalizedSlotName?.(entry.itemPortName) ?? null

  if (!swapGroup) {
    return {
      portName: entry.itemPortName,
      parentPortName: entry.parentItemPortName,
      localizedSlotName,
      defaultComponentEntityClass: resolvedDefaultEntityClass,
      swapGroupId: null,
      eligibleComponents: [],
      currentInstalledEntityClass: null,
      sourceAuthority,
      confidence: 'unresolved',
      diagnostics: resolvedDefaultEntityClass
        ? [{ code: 'swap-group-unknown-family', message: `No swap-group tag found for default component "${resolvedDefaultEntityClass}".`, severity: 'warning' }]
        : [{ code: 'swap-group-unresolved-reference', message: `No resolvable default entity class for port "${entry.itemPortName}" — the raw file reference "${entry.factoryEntityClassReference ?? '(none)'}" could not be resolved by the caller.`, severity: 'warning' }],
    }
  }

  return {
    portName: entry.itemPortName,
    parentPortName: entry.parentItemPortName,
    localizedSlotName,
    defaultComponentEntityClass: resolvedDefaultEntityClass,
    swapGroupId: swapGroup.swapGroupId,
    eligibleComponents: swapGroup.eligibleComponents,
    currentInstalledEntityClass: null,
    sourceAuthority,
    confidence: swapGroup.confidence,
    diagnostics: swapGroup.diagnostics,
  }
}

/**
 * The one entry point this module exposes. Never mutates `physicalPorts`
 * — the merge only ever reads it, to decide "attach" vs. "synthesize";
 * the caller remains solely responsible for the real `Hardpoint`/`Port`
 * store (this module has no write access to it by construction).
 */
export function mergeConfigurableTopology(input: MergeInput): CanonicalConfigurableTopology {
  const physicalPortNames = new Set(input.physicalPorts.map((p) => p.itemPortName))
  const diagnostics: MergeDiagnostic[] = []
  const configurableSlots: ConfigurableSlot[] = []
  const seenPortNames = new Set<string>()

  for (const { entry, resolvedDefaultEntityClass } of input.configurationEntries) {
    if (seenPortNames.has(entry.itemPortName)) {
      diagnostics.push({
        code: 'configuration-duplicate-port-name',
        message: `"${entry.itemPortName}" appears more than once in this ship's Default Loadout configuration entries — only the first occurrence is merged.`,
        itemPortName: entry.itemPortName,
        severity: 'warning',
      })
      continue
    }
    seenPortNames.add(entry.itemPortName)

    const alreadyPhysical = physicalPortNames.has(entry.itemPortName)
    const sourceAuthority: ConfigurableSlot['sourceAuthority'] = alreadyPhysical ? 'geometry-and-configuration' : 'configuration-only'
    const slot = buildSlot(entry, resolvedDefaultEntityClass, input, sourceAuthority)
    configurableSlots.push(slot)

    diagnostics.push({
      code: alreadyPhysical ? 'configurable-slot-merged-into-existing-port' : 'configurable-slot-synthesized',
      message: alreadyPhysical
        ? `"${entry.itemPortName}" already exists in the Physical Port Graph — configuration metadata attached, no duplicate row created.`
        : `"${entry.itemPortName}" is not present in the Physical Port Graph — synthesized as a new Configurable Slot node.`,
      itemPortName: entry.itemPortName,
      severity: 'info',
    })
  }

  return { shipEntityClass: input.shipEntityClass, configurableSlots, diagnostics }
}
