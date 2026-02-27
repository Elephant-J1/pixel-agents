import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import { GatewayClient } from './gatewayClient.js'
import { EventTranslator } from './eventTranslator.js'
import { DashboardServer } from './dashboardServer.js'
import { startSimulator } from './gatewaySimulator.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

const SIMULATE = process.env.SIMULATE === 'true'
const GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL ?? 'ws://127.0.0.1:18789'
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN ?? ''
const PORT = parseInt(process.env.PORT ?? '3001', 10)

if (SIMULATE) {
  console.log('[Server] SIMULATION mode')
  startSimulator(18789)
}

const gatewayClient = new GatewayClient({
  url: GATEWAY_URL,
  token: GATEWAY_TOKEN || undefined,
})

const translator = new EventTranslator(gatewayClient)
const dashboard = new DashboardServer(translator)

wss.on('connection', (ws) => {
  dashboard.addClient(ws)
})

app.get('/api/health', (_req, res) => {
  res.json({
    proxy: 'ok',
    gateway: gatewayClient.getState(),
    agents: translator.getTrackedAgents().length,
    browserClients: dashboard.getClientCount(),
  })
})

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

server.listen(PORT, () => {
  console.log('[Server] Proxy on :' + PORT)
  console.log('[Server] Gateway:', GATEWAY_URL)
  console.log('[Server] Simulation:', SIMULATE)
  gatewayClient.connect()
})
