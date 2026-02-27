export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
type MessageHandler = (data: unknown) => void
type ConnectionHandler = (state: ConnectionState, detail?: string) => void

class WebSocketClient {
  private ws: WebSocket | null = null
  private messageHandlers = new Set<MessageHandler>()
  private connectionHandlers = new Set<ConnectionHandler>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 30000
  private url: string
  private state: ConnectionState = 'disconnected'
  private sendBuffer: string[] = []
  private maxBufferSize = 100

  constructor(url: string) {
    this.url = url
    this.connect()
  }

  private setState(state: ConnectionState, detail?: string): void {
    this.state = state
    for (const handler of this.connectionHandlers) {
      handler(state, detail)
    }
  }

  private connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return
    }

    this.setState('connecting')

    try {
      this.ws = new WebSocket(this.url)
    } catch (e) {
      this.setState('disconnected', 'Failed to create WebSocket')
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.setState('connected')
      this.reconnectDelay = 1000

      for (const msg of this.sendBuffer) {
        this.ws?.send(msg)
      }
      this.sendBuffer = []

      this.postMessage({ type: 'webviewReady' })
    }

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as unknown
        for (const handler of this.messageHandlers) {
          handler(data)
        }
      } catch {
        // ignore parse errors
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      this.setState('disconnected')
      this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      // onclose will fire after
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.setState('reconnecting', `Retrying in ${Math.round(this.reconnectDelay / 1000)}s`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
  }

  postMessage(msg: unknown): void {
    const serialized = JSON.stringify(msg)
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serialized)
    } else {
      this.sendBuffer.push(serialized)
      if (this.sendBuffer.length > this.maxBufferSize) {
        this.sendBuffer.shift()
      }
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => this.messageHandlers.delete(handler)
  }

  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler)
    handler(this.state)
    return () => this.connectionHandlers.delete(handler)
  }

  getState(): ConnectionState {
    return this.state
  }

  dispose(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
  }
}

const WS_URL =
  (import.meta as unknown as { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL ??
  `ws://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:3001/ws`

export const wsClient = new WebSocketClient(WS_URL)

export const vscode = {
  postMessage: (msg: unknown) => wsClient.postMessage(msg),
}
