/**
 * Translates OpenClaw Gateway events into Pixel Agents dashboard messages.
 * Event names may vary between OpenClaw versions; adjust handleGatewayEvent if needed.
 */

import { EventEmitter } from 'events'
import type { GatewayClient } from './gatewayClient.js'
import type { TrackedAgent, DashboardMessage, GatewayConnectionState } from './types.js'

function basename(p: unknown): string {
  if (typeof p !== 'string') return ''
  return p.split('/').pop() ?? p
}

function formatToolStatus(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Read':
      return `Reading ${basename(input.file_path)}`
    case 'Edit':
      return `Editing ${basename(input.file_path)}`
    case 'Write':
      return `Writing ${basename(input.file_path)}`
    case 'Bash': {
      const cmd = (input.command as string) ?? ''
      return `Running: ${cmd.length > 60 ? cmd.slice(0, 60) + '…' : cmd}`
    }
    case 'Glob':
      return 'Searching files'
    case 'Grep':
      return 'Searching code'
    case 'WebFetch':
      return 'Fetching web content'
    case 'WebSearch':
      return 'Searching the web'
    case 'Task': {
      const desc = typeof input.description === 'string' ? input.description : ''
      return desc ? `Subtask: ${desc.length > 80 ? desc.slice(0, 80) + '…' : desc}` : 'Running subtask'
    }
    case 'browser_navigate':
      return 'Opening browser'
    case 'browser_click':
      return 'Clicking in browser'
    case 'browser_type':
      return 'Typing in browser'
    case 'browser_snapshot':
      return 'Reading browser page'
    default:
      return `Using ${toolName}`
  }
}

export class EventTranslator extends EventEmitter {
  private agents = new Map<string, TrackedAgent>()
  private nextAgentId = 1
  private sessionToId = new Map<string, number>()
  private toolIdCounter = 0

  constructor(private gateway: GatewayClient) {
    super()
    this.gateway.on('gatewayEvent', (event: string, payload: unknown) => {
      this.handleGatewayEvent(event, payload as Record<string, unknown>)
    })
    this.gateway.on('connected', () => {
      this.syncInitialState()
    })
    this.gateway.on('connectionState', (state: string, detail?: string) => {
      this.emitDashboard({ type: 'connectionStatus', gateway: state as GatewayConnectionState, detail })
    })
  }

  private async syncInitialState(): Promise<void> {
    try {
      await this.gateway.request('system-presence', {})
    } catch {
      // optional
    }
    const agentIds = Array.from(this.sessionToId.values()).sort((a, b) => a - b)
    this.emitDashboard({
      type: 'existingAgents',
      agents: agentIds,
      agentMeta: {},
      folderNames: {},
    })
  }

  private handleGatewayEvent(event: string, payload: Record<string, unknown>): void {
    if (event === 'agent.stream') {
      const stream = payload?.stream as string | undefined

      if (stream === 'lifecycle') {
        this.handleLifecycleEvent(payload)
      } else if (stream === 'tool') {
        this.handleToolEvent(payload)
      }
      // assistant stream optional for future
    } else if (event === 'exec.approval.requested') {
      this.handleApprovalRequest(payload)
    }
  }

  private handleLifecycleEvent(payload: Record<string, unknown>): void {
    const phase = (payload?.data as Record<string, unknown>)?.phase ?? payload?.phase
    const sessionKey = (payload?.sessionKey ?? (payload?.data as Record<string, unknown>)?.sessionKey) as
      | string
      | undefined
    if (!sessionKey) return

    if (phase === 'start') {
      let id = this.sessionToId.get(sessionKey)
      if (id === undefined) {
        id = this.nextAgentId++
        this.sessionToId.set(sessionKey, id)
        const agent: TrackedAgent = {
          id,
          sessionKey,
          name: `Agent #${id}`,
          status: 'busy',
          currentTask: null,
          currentRunId: (payload?.runId as string) ?? null,
          toolHistory: [],
          createdAt: Date.now(),
        }
        this.agents.set(sessionKey, agent)
        this.emitDashboard({ type: 'agentCreated', id, name: agent.name })
      } else {
        const agent = this.agents.get(sessionKey)
        if (agent) {
          agent.status = 'busy'
          agent.currentRunId = (payload?.runId as string) ?? null
          agent.toolHistory = []
        }
      }
      this.emitDashboard({ type: 'agentStatus', id: id!, status: 'active' })
    } else if (phase === 'end') {
      const id = this.sessionToId.get(sessionKey)
      if (id === undefined) return
      const agent = this.agents.get(sessionKey)
      if (agent) {
        agent.status = 'idle'
        agent.currentRunId = null
      }
      this.emitDashboard({ type: 'agentToolsClear', id })
      this.emitDashboard({ type: 'agentStatus', id, status: 'waiting' })
    } else if (phase === 'error') {
      const id = this.sessionToId.get(sessionKey)
      if (id === undefined) return
      const agent = this.agents.get(sessionKey)
      if (agent) agent.status = 'error'
      this.emitDashboard({
        type: 'agentError',
        id: id!,
        error: (payload?.error as string) ?? 'Unknown error',
      })
    }
  }

  private handleToolEvent(payload: Record<string, unknown>): void {
    const sessionKey = (payload?.sessionKey ?? (payload?.data as Record<string, unknown>)?.sessionKey) as
      | string
      | undefined
    const id = sessionKey ? this.sessionToId.get(sessionKey) : undefined
    if (id === undefined) return

    const agent = sessionKey ? this.agents.get(sessionKey) : undefined
    const toolEvent = (payload?.data ?? payload) as Record<string, unknown>
    const toolPhase = toolEvent?.phase ?? toolEvent?.type
    const toolName = (toolEvent?.toolName ?? toolEvent?.name ?? 'unknown') as string
    const toolInput = (toolEvent?.input ?? {}) as Record<string, unknown>
    const toolId = (toolEvent?.toolId ?? `tool-${++this.toolIdCounter}`) as string

    if (toolPhase === 'start' || toolPhase === 'tool_start') {
      const status = formatToolStatus(toolName, toolInput)
      if (agent) {
        agent.currentTask = status
        agent.toolHistory.push({
          toolId,
          name: toolName,
          status,
          startedAt: Date.now(),
          done: false,
          permissionWait: false,
        })
      }
      this.emitDashboard({ type: 'agentToolStart', id, toolId, status })
    } else if (toolPhase === 'end' || toolPhase === 'tool_end') {
      if (agent) {
        const tool = agent.toolHistory.find((t) => t.toolId === toolId)
        if (tool) {
          tool.done = true
          tool.completedAt = Date.now()
        }
      }
      this.emitDashboard({ type: 'agentToolDone', id, toolId })
    }
  }

  private handleApprovalRequest(payload: Record<string, unknown>): void {
    const sessionKey = payload?.sessionKey as string | undefined
    const id = sessionKey ? this.sessionToId.get(sessionKey) : undefined
    if (id === undefined) return
    const agent = sessionKey ? this.agents.get(sessionKey) : undefined
    if (agent) agent.status = 'waiting_approval'
    this.emitDashboard({ type: 'agentToolPermission', id })
  }

  async resolveApproval(agentId: number, approved: boolean): Promise<void> {
    for (const [sessionKey, id] of this.sessionToId) {
      if (id === agentId) {
        try {
          await this.gateway.request('exec.approval.resolve', { sessionKey, approved })
          if (approved) {
            this.emitDashboard({ type: 'agentToolPermissionClear', id: agentId })
          }
        } catch (e) {
          console.error('[Translator] Failed to resolve approval:', e)
        }
        return
      }
    }
  }

  getTrackedAgents(): TrackedAgent[] {
    return Array.from(this.agents.values())
  }

  getAgentById(id: number): TrackedAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.id === id) return agent
    }
    return undefined
  }

  getGatewayState(): GatewayConnectionState {
    return this.gateway.getState()
  }

  private emitDashboard(msg: DashboardMessage): void {
    this.emit('dashboardMessage', msg)
  }
}
