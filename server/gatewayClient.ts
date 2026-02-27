import WebSocket from 'ws'
import { EventEmitter } from 'events'
import crypto from 'crypto'
import type { GatewayConnectionState } from './types.js'

export interface GatewayClientConfig {
  url: string
  token?: string
  clientId?: string
}

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null
  private config: GatewayClientConfig
  private state: GatewayConnectionState = 'disconnected'
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private requestId = 0
  private pendingRequests = new Map<
    string,
    { resolve: (data: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }
  >()
  private deviceId: string

  constructor(config: GatewayClientConfig) {
    super()
    this.config = config
    this.deviceId = crypto.randomUUID()
  }

  getState(): GatewayConnectionState {
    return this.state
  }

  private setState(state: GatewayConnectionState, detail?: string): void {
    this.state = state
    this.emit('connectionState', state, detail)
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return
    }

    this.setState('connecting')
    console.log('[GW] Connecting to', this.config.url, '...')

    try {
      this.ws = new WebSocket(this.config.url)
    } catch (e) {
      this.setState('error', `Failed to create WebSocket: ${e}`)
      this.scheduleReconnect()
      return
    }

    this.ws.on('open', () => {
      console.log('[GW] WebSocket open, waiting for challenge...')
      this.setState('handshaking')
    })

    this.ws.on('message', (raw: Buffer) => {
      try {
        const frame = JSON.parse(raw.toString()) as Record<string, unknown>
        this.handleFrame(frame)
      } catch {
        // ignore parse errors
      }
    })

    this.ws.on('close', () => {
      console.log('[GW] Disconnected')
      this.cleanup()
      this.setState('disconnected')
      this.scheduleReconnect()
    })

    this.ws.on('error', (err: Error) => {
      console.error('[GW] WebSocket error:', err.message)
    })
  }

  private handleFrame(frame: Record<string, unknown>): void {
    if (frame.type === 'event') {
      const event = frame.event as string
      const payload = frame.payload as Record<string, unknown> | undefined
      if (event === 'connect.challenge') {
        this.sendConnectRequest((payload?.nonce as string) ?? '')
      } else {
        this.emit('gatewayEvent', event, payload)
      }
    } else if (frame.type === 'res') {
      const id = frame.id as string
      const pending = this.pendingRequests.get(id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingRequests.delete(id)
        if (frame.ok) {
          const payload = frame.payload as Record<string, unknown> | undefined
          if (payload?.type === 'hello-ok') {
            this.onConnected(payload)
          }
          pending.resolve(frame.payload)
        } else {
          const err = (frame as { error?: { message?: string } }).error
          pending.reject(new Error((err?.message as string) ?? 'Request failed'))
        }
      }
    }
  }

  private sendConnectRequest(_nonce: string): void {
    const id = this.nextRequestId()
    const params: Record<string, unknown> = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: this.config.clientId ?? 'pixel-agents-dashboard',
        version: '2.0.0',
        platform: process.platform,
        mode: 'operator',
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write', 'operator.approvals'],
      caps: [],
      commands: [],
      permissions: {},
      locale: 'en-US',
      userAgent: 'pixel-agents-dashboard/2.0.0',
      device: { id: this.deviceId },
    }
    if (this.config.token) {
      params.auth = { token: this.config.token }
    }
    this.sendRaw({ type: 'req', id, method: 'connect', params })
  }

  private onConnected(helloPayload: Record<string, unknown>): void {
    console.log('[GW] Connected')
    this.reconnectDelay = 1000
    this.setState('connected')
    const policy = helloPayload.policy as { tickIntervalMs?: number } | undefined
    const tickMs = policy?.tickIntervalMs ?? 15000
    this.tickTimer = setInterval(() => {
      this.sendRaw({ type: 'event', event: 'tick' })
    }, tickMs)
    this.emit('connected')
  }

  request(method: string, params: Record<string, unknown>, timeoutMs = 10000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.state !== 'connected') {
        reject(new Error(`Gateway not connected (state: ${this.state})`))
        return
      }
      const id = this.nextRequestId()
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request ${method} timed out`))
      }, timeoutMs)
      this.pendingRequests.set(id, { resolve, reject, timer })
      this.sendRaw({ type: 'req', id, method, params })
    })
  }

  private sendRaw(frame: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame))
    }
  }

  private nextRequestId(): string {
    return `pa-${++this.requestId}`
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    console.log('[GW] Reconnecting in', Math.round(this.reconnectDelay / 1000), 's...')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
  }

  private cleanup(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Connection closed'))
    }
    this.pendingRequests.clear()
    this.ws = null
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.cleanup()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setState('disconnected')
  }
}
