interface TopBarProps {
  activeCount: number
  idleCount: number
  errorCount: number
  connectionState: string
  gatewayState: string
}

export function TopBar({ activeCount, idleCount, errorCount, connectionState, gatewayState }: TopBarProps) {
  const isConnected = connectionState === 'connected'
  const gatewayOk = gatewayState === 'connected'

  return (
    <div
      style={{
        height: 48,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 16,
        background: 'var(--pixel-bg)',
        borderBottom: '2px solid var(--pixel-border)',
        boxShadow: 'var(--pixel-shadow)',
      }}
    >
      <span style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--pixel-text)' }}>Pixel Agents</span>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isConnected && gatewayOk ? 'var(--pixel-green)' : '#e55',
        }}
        title={isConnected && gatewayOk ? 'Connected' : 'Disconnected'}
      />
      <span style={{ color: 'var(--pixel-text-dim)', fontSize: '18px' }}>
        Active: {activeCount} · Idle: {idleCount}
        {errorCount > 0 ? ` · Error: ${errorCount}` : ''}
      </span>
    </div>
  )
}
