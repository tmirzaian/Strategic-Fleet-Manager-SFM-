import type { ReactNode } from 'react'

export interface MountedWorkspacePanelProps {
  title?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
  footer?: ReactNode
  testId?: string
}

/**
 * EWO-110 (Part G) — the canonical panel shell, the standard replacement
 * for an ad hoc `<Card>`/`.panel div` throughout Quartermaster Edition.
 * Four named slots only — title, toolbar, content, footer — each
 * optional except content. Presentation only: this component has no
 * opinion on what a Station puts in any slot.
 */
export default function MountedWorkspacePanel({ title, toolbar, children, footer, testId }: MountedWorkspacePanelProps) {
  const hasHeader = title != null || toolbar != null
  return (
    <div data-testid={testId ?? 'mounted-workspace-panel'} className="panel overflow-hidden">
      {hasHeader && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
          {title != null && <div className="text-sm font-display font-bold text-white">{title}</div>}
          {toolbar != null && <div className="flex items-center gap-2">{toolbar}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
      {footer != null && <div className="px-4 py-3 border-t border-white/10">{footer}</div>}
    </div>
  )
}
