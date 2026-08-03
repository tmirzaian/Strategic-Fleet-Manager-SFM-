import type { ReactNode } from 'react'

/**
 * EWO-109 (Part C) — the Primary Workspace region: the compartment's
 * core content, per QDS-001 Part C ("Required, every compartment").
 * Deliberately minimal — the shell places the workspace, it never
 * decides what a workspace contains (Part B). No styling of its own
 * beyond what every consumer already needs (a plain block-level wrapper),
 * so it never fights a Station's own content styling.
 */
export default function PrimaryWorkspace({ children }: { children: ReactNode }) {
  return <div data-testid="primary-workspace">{children}</div>
}
