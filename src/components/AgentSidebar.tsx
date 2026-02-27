import type { ToolActivity } from '../office/types.js'
import { vscode } from '../api/wsClient.js'

interface AgentSidebarProps {
  agentId: number
  agentTools: Record<number, ToolActivity[]>
  agentStatuses: Record<number, string>
  onClose: () => void
}

export function AgentSidebar({ agentId, agentTools, agentStatuses, onClose }: AgentSidebarProps) {
  const tools = agentTools[agentId] ?? []
  const status = agentStatuses[agentId] ?? 'idle'
  const hasPermissionWait = tools.some((t) => t.permissionWait && !t.done)

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: 'var(--pixel-bg)',
        borderLeft: '2px solid var(--pixel-border)',
        padding: 12,
        overflow: 'auto',
        boxShadow: 'var(--pixel-shadow)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: '20px', color: 'var(--pixel-text)' }}>Agent #{agentId}</strong>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '2px solid var(--pixel-border)',
            color: 'var(--pixel-text)',
            cursor: 'pointer',
            padding: '2px 8px',
            borderRadius: 0,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: '16px', color: 'var(--pixel-text-dim)', marginBottom: 8 }}>
        Status: {status}
      </div>
      {tools.length > 0 && (
        <ul style={{ marginTop: 8, paddingLeft: 20, color: 'var(--pixel-text)' }}>
          {tools.map((t) => (
            <li key={t.toolId} style={{ marginBottom: 4 }}>
              {t.done ? '✓' : '○'} {t.status}
            </li>
          ))}
        </ul>
      )}
      {hasPermissionWait && (
        <button
          type="button"
          onClick={() => vscode.postMessage({ type: 'approveExec', id: agentId, approved: true })}
          style={{
            marginTop: 8,
            padding: '6px 12px',
            background: 'var(--pixel-green)',
            border: '2px solid var(--pixel-border)',
            color: '#fff',
            cursor: 'pointer',
            borderRadius: 0,
          }}
        >
          Approve
        </button>
      )}
    </div>
  )
}
