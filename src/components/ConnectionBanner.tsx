import type { ConnectionState } from '../api/wsClient.js'

interface ConnectionBannerProps {
  state: ConnectionState
  gatewayState?: string
}

export function ConnectionBanner({ state, gatewayState }: ConnectionBannerProps) {
  const messages: Record<string, string> = {
    connecting: 'Connecting to dashboard server...',
    disconnected: 'Dashboard server disconnected. Retrying...',
    reconnecting: 'Reconnecting...',
  }

  const gatewayMsg =
    gatewayState === 'error' || gatewayState === 'disconnected'
      ? ' • OpenClaw Gateway unreachable'
      : ''

  return (
    <div
      style={{
        background: 'rgba(200, 50, 50, 0.9)',
        color: '#fff',
        padding: '6px 16px',
        fontSize: '20px',
        textAlign: 'center',
        flexShrink: 0,
        borderBottom: '2px solid rgba(255, 100, 100, 0.5)',
      }}
    >
      <span
        className="pixel-agents-pulse"
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#ff6b6b',
          marginRight: 8,
          verticalAlign: 'middle',
        }}
      />
      {messages[state] ?? 'Connection issue'}
      {gatewayMsg}
    </div>
  )
}
