import { WebSocketServer, WebSocket } from 'ws'

const TOOL_SCENARIOS: Array<{ name: string; input: Record<string, unknown> }> = [
  { name: 'Read', input: { file_path: '/docs/api-reference.md' } },
  { name: 'WebSearch', input: { query: 'stripe subscription API' } },
  { name: 'Bash', input: { command: 'npm run test' } },
  { name: 'Edit', input: { file_path: 'src/handler.ts' } },
  { name: 'Read', input: { file_path: 'config/pylon.yaml' } },
  { name: 'WebFetch', input: { url: 'https://docs.example.com/api' } },
  { name: 'Grep', input: { query: 'handleTicket', path: 'src/' } },
  { name: 'Write', input: { file_path: 'responses/draft.md' } },
  { name: 'Bash', input: { command: 'curl -s https://api.example.com/v1/subscriptions' } },
  { name: 'browser_navigate', input: { url: 'https://app.example.com' } },
]

function sendEvent(ws: WebSocket, event: string, payload: Record<string, unknown>): void {
  ws.send(JSON.stringify({ type: 'event', event, payload }))
}

export function startSimulator(port = 18789): WebSocketServer {
  const wss = new WebSocketServer({ port })
  console.log('[Simulator] Mock OpenClaw Gateway on ws://127.0.0.1:' + port)

  const sessions = ['support-triage', 'billing-agent', 'docs-writer', 'bug-researcher']
  let toolIdCounter = 0

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'event',
        event: 'connect.challenge',
        payload: { nonce: 'sim-' + Date.now(), ts: Date.now() },
      }),
    )

    ws.on('message', (raw: Buffer) => {
      try {
        const frame = JSON.parse(raw.toString()) as Record<string, unknown>

        if (frame.type === 'req' && frame.method === 'connect') {
          ws.send(
            JSON.stringify({
              type: 'res',
              id: frame.id,
              ok: true,
              payload: { type: 'hello-ok', protocol: 3, policy: { tickIntervalMs: 15000 } },
            }),
          )
          startAgentSimulation(ws, sessions)
        } else if (frame.type === 'req' && frame.method === 'system-presence') {
          ws.send(
            JSON.stringify({
              type: 'res',
              id: frame.id,
              ok: true,
              payload: { entries: [] },
            }),
          )
        }
      } catch {
        // ignore
      }
    })
  })

  function startAgentSimulation(ws: WebSocket, sessionKeys: string[]): void {
    sessionKeys.forEach((sessionKey, i) => {
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) return
        sendEvent(ws, 'agent.stream', {
          stream: 'lifecycle',
          sessionKey,
          data: { phase: 'start' },
          runId: `run-${Date.now()}-${i}`,
        })
        simulateToolCycle(ws, sessionKey)
      }, i * 1500)
    })
  }

  function simulateToolCycle(ws: WebSocket, sessionKey: string): void {
    const scenario = TOOL_SCENARIOS[Math.floor(Math.random() * TOOL_SCENARIOS.length)]!
    const toolId = `tool-${++toolIdCounter}`

    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) return
      sendEvent(ws, 'agent.stream', {
        stream: 'tool',
        sessionKey,
        data: {
          phase: 'start',
          toolName: scenario.name,
          input: scenario.input,
          toolId,
        },
      })

      const duration = 2000 + Math.random() * 6000
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) return
        sendEvent(ws, 'agent.stream', {
          stream: 'tool',
          sessionKey,
          data: { phase: 'end', toolId },
        })

        const roll = Math.random()
        if (roll < 0.6) {
          setTimeout(() => simulateToolCycle(ws, sessionKey), 500 + Math.random() * 1500)
        } else {
          sendEvent(ws, 'agent.stream', {
            stream: 'lifecycle',
            sessionKey,
            data: { phase: 'end' },
          })
          setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) return
            sendEvent(ws, 'agent.stream', {
              stream: 'lifecycle',
              sessionKey,
              data: { phase: 'start' },
              runId: `run-${Date.now()}`,
            })
            simulateToolCycle(ws, sessionKey)
          }, 5000 + Math.random() * 15000)
        }
      }, duration)
    }, 300)
  }

  return wss
}
