import type { ReactNode } from 'react'

/**
 * EWO-113 (Objective 3) — originally the first step in retiring the idea
 * of a flat "page background" in favor of an environmental continuation,
 * wrapping the routed content area in its own restrained radial-gradient
 * background. EWO-115 (Part B) promoted that background to
 * `FlagshipEnvironmentLayer` — a true full-viewport `position: fixed`
 * layer rendered once in `App.tsx`, outside the flex row entirely, so it
 * can extend beneath the Sidebar rather than stopping at `<main>`'s own
 * edge. `FlagshipFrame` keeps its layout role (the flex column every
 * routed page renders inside, sitting visually above the fixed backdrop)
 * but no longer supplies its own background — supplying one here would
 * duplicate `FlagshipEnvironmentLayer` and reintroduce exactly the
 * "independent page background" seam EWO-115's own audit (Part A) flagged.
 *
 * No business logic, no per-Station awareness — this component takes no
 * props besides `children` and knows nothing about which Station is
 * currently active.
 */
export default function FlagshipFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col relative z-10" data-testid="flagship-frame">
      {children}
    </div>
  )
}
