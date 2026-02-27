/** Gateway connection state */
export type GatewayConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'handshaking'
  | 'error'

export type AgentStatus = 'idle' | 'busy' | 'error' | 'waiting_approval'

export interface TrackedAgent {
  id: number
  sessionKey: string
  name: string
  status: AgentStatus
  currentTask: string | null
  currentRunId: string | null
  toolHistory: TrackedTool[]
  createdAt: number
}

export interface TrackedTool {
  toolId: string
  name: string
  status: string
  startedAt: number
  completedAt?: number
  done: boolean
  permissionWait: boolean
}

/** Messages sent from proxy to browser (same types the frontend already handles) */
export type DashboardMessage =
  | { type: 'layoutLoaded'; layout: unknown }
  | {
      type: 'existingAgents'
      agents: number[]
      agentMeta: Record<string, unknown>
      folderNames: Record<number, string>
    }
  | { type: 'agentCreated'; id: number; name?: string; folderName?: string }
  | { type: 'agentClosed'; id: number }
  | { type: 'agentToolStart'; id: number; toolId: string; status: string }
  | { type: 'agentToolDone'; id: number; toolId: string }
  | { type: 'agentToolsClear'; id: number }
  | { type: 'agentStatus'; id: number; status: 'active' | 'waiting' | 'error' }
  | { type: 'agentToolPermission'; id: number }
  | { type: 'agentToolPermissionClear'; id: number }
  | { type: 'agentError'; id: number; error: string }
  | { type: 'connectionStatus'; gateway: GatewayConnectionState; detail?: string }
  | { type: 'settingsLoaded'; soundEnabled: boolean }
  | { type: 'characterSpritesLoaded'; characters: unknown }
  | { type: 'floorTilesLoaded'; sprites: unknown }
  | { type: 'wallTilesLoaded'; sprites: unknown }
  | { type: 'furnitureAssetsLoaded'; catalog: unknown; sprites: unknown }
