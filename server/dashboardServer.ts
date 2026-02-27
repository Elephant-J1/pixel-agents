import fs from 'fs'
import path from 'path'
import type { WebSocket } from 'ws'
import type { EventTranslator } from './eventTranslator.js'
import type { DashboardMessage } from './types.js'
import { readLayout, writeLayout, loadDefaultLayout } from './layoutStore.js'
import {
  loadCharacterSprites,
  loadFloorTiles,
  loadWallTiles,
  loadFurnitureAssets,
} from './assetLoader.js'

function getAssetsRoot(): string {
  const cwd = process.cwd()
  const publicPath = path.join(cwd, 'public')
  if (fs.existsSync(publicPath)) return publicPath
  return path.join(cwd, 'dist')
}

export class DashboardServer {
  private clients = new Set<WebSocket>()
  private translator: EventTranslator
  private assetsRoot: string

  constructor(translator: EventTranslator) {
    this.translator = translator
    this.assetsRoot = getAssetsRoot()

    this.translator.on('dashboardMessage', (msg: DashboardMessage) => {
      this.broadcast(msg)
    })
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws)
    console.log('[Dashboard] Browser connected, total', this.clients.size)

    ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>
        this.handleBrowserMessage(ws, msg)
      } catch {
        // ignore
      }
    })

    ws.on('close', () => {
      this.clients.delete(ws)
      console.log('[Dashboard] Browser disconnected, total', this.clients.size)
    })
  }

  private handleBrowserMessage(ws: WebSocket, msg: Record<string, unknown>): void {
    if (msg.type === 'webviewReady') {
      this.sendInitialState(ws)
      return
    }
    if (msg.type === 'approveExec') {
      const id = msg.id as number
      const approved = msg.approved as boolean
      this.translator.resolveApproval(id, approved)
      return
    }
    if (msg.type === 'saveLayout') {
      const layout = msg.layout as Record<string, unknown>
      if (layout && typeof layout.version === 'number' && Array.isArray(layout.tiles)) {
        writeLayout(layout)
      }
      return
    }
    if (msg.type === 'saveAgentSeats') {
      // Persist to memory or file if desired
      return
    }
    if (msg.type === 'setSoundEnabled') {
      // Could persist and broadcast settingsLoaded
      return
    }
  }

  private sendInitialState(ws: WebSocket): void {
    // Assets first so catalog is ready; existingAgents before layoutLoaded so frontend can add agents when layout is applied
    const chars = loadCharacterSprites(this.assetsRoot)
    if (chars) {
      this.sendTo(ws, { type: 'characterSpritesLoaded', characters: chars })
    }
    const floor = loadFloorTiles(this.assetsRoot)
    if (floor) {
      this.sendTo(ws, { type: 'floorTilesLoaded', sprites: floor })
    }
    const wall = loadWallTiles(this.assetsRoot)
    if (wall) {
      this.sendTo(ws, { type: 'wallTilesLoaded', sprites: wall })
    }
    const furniture = loadFurnitureAssets(this.assetsRoot)
    if (furniture) {
      this.sendTo(ws, {
        type: 'furnitureAssetsLoaded',
        catalog: furniture.catalog,
        sprites: furniture.sprites,
      })
    }

    this.sendTo(ws, { type: 'settingsLoaded', soundEnabled: true })

    const agents = this.translator.getTrackedAgents()
    this.sendTo(ws, {
      type: 'existingAgents',
      agents: agents.map((a) => a.id),
      agentMeta: {},
      folderNames: {},
    })

    const layout = readLayout() ?? loadDefaultLayout(this.assetsRoot)
    this.sendTo(ws, { type: 'layoutLoaded', layout: layout ?? null })

    for (const agent of agents) {
      if (agent.status === 'busy') {
        this.sendTo(ws, { type: 'agentStatus', id: agent.id, status: 'active' })
        for (const tool of agent.toolHistory) {
          if (!tool.done) {
            this.sendTo(ws, {
              type: 'agentToolStart',
              id: agent.id,
              toolId: tool.toolId,
              status: tool.status,
            })
          }
        }
      } else if (agent.status === 'error') {
        this.sendTo(ws, { type: 'agentStatus', id: agent.id, status: 'error' })
      }
    }

    this.sendTo(ws, {
      type: 'connectionStatus',
      gateway: this.translator.getGatewayState(),
    })
  }

  private broadcast(msg: unknown): void {
    const data = JSON.stringify(msg)
    for (const ws of this.clients) {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(data)
      }
    }
  }

  private sendTo(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg))
    }
  }

  getClientCount(): number {
    return this.clients.size
  }
}
