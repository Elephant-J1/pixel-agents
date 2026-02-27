/**
 * Server-side asset loading. Reads PNGs and catalog from disk,
 * returns payloads suitable for the existing webview message types.
 */

import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'

const ALPHA_THRESHOLD = 128
const CHAR_FRAME_W = 16
const CHAR_FRAME_H = 32
const CHAR_FRAMES_PER_ROW = 7
const FLOOR_TILE_SIZE = 16
const WALL_PIECE_W = 16
const WALL_PIECE_H = 32
const WALL_GRID_COLS = 4

type SpriteData = string[][]

function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** Convert PNG buffer to 2D hex array; alpha >= 128 = opaque */
function pngToSpriteData(png: PNG): SpriteData {
  const rows: SpriteData = []
  for (let y = 0; y < png.height; y++) {
    const row: string[] = []
    for (let x = 0; x < png.width; x++) {
      const idx = (y * png.width + x) * 4
      const r = png.data[idx]!
      const g = png.data[idx + 1]!
      const b = png.data[idx + 2]!
      const a = png.data[idx + 3]!
      row.push(a >= ALPHA_THRESHOLD ? rgbaToHex(r, g, b) : '')
    }
    rows.push(row)
  }
  return rows
}

/** Extract a region from PNG as SpriteData */
function extractRegion(png: PNG, x: number, y: number, w: number, h: number): SpriteData {
  const rows: SpriteData = []
  for (let row = 0; row < h; row++) {
    const line: string[] = []
    for (let col = 0; col < w; col++) {
      const px = x + col
      const py = y + row
      const idx = (py * png.width + px) * 4
      const r = png.data[idx]!
      const g = png.data[idx + 1]!
      const b = png.data[idx + 2]!
      const a = png.data[idx + 3]!
      line.push(a >= ALPHA_THRESHOLD ? rgbaToHex(r, g, b) : '')
    }
    rows.push(line)
  }
  return rows
}

export interface LoadedCharacterData {
  down: SpriteData[]
  up: SpriteData[]
  right: SpriteData[]
}

function loadCharacterPng(filePath: string): LoadedCharacterData | null {
  try {
    const buf = fs.readFileSync(filePath)
    const png = PNG.sync.read(buf)
    // 112×96: 7 frames × 16px, 3 rows × 32px (down, up, right)
    const down: SpriteData[] = []
    const up: SpriteData[] = []
    const right: SpriteData[] = []
    for (let frame = 0; frame < CHAR_FRAMES_PER_ROW; frame++) {
      down.push(extractRegion(png, frame * CHAR_FRAME_W, 0, CHAR_FRAME_W, CHAR_FRAME_H))
      up.push(extractRegion(png, frame * CHAR_FRAME_W, CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H))
      right.push(extractRegion(png, frame * CHAR_FRAME_W, CHAR_FRAME_H * 2, CHAR_FRAME_W, CHAR_FRAME_H))
    }
    return { down, up, right }
  } catch {
    return null
  }
}

export function loadCharacterSprites(assetsRoot: string): LoadedCharacterData[] | null {
  const dir = path.join(assetsRoot, 'assets', 'characters')
  if (!fs.existsSync(dir)) return null
  const out: LoadedCharacterData[] = []
  for (let i = 0; i < 6; i++) {
    const p = path.join(dir, `char_${i}.png`)
    if (!fs.existsSync(p)) return null
    const data = loadCharacterPng(p)
    if (!data) return null
    out.push(data)
  }
  return out
}

export function loadFloorTiles(assetsRoot: string): SpriteData[] | null {
  const p = path.join(assetsRoot, 'assets', 'floors.png')
  if (!fs.existsSync(p)) return null
  try {
    const buf = fs.readFileSync(p)
    const png = PNG.sync.read(buf)
    // 112×16 = 7 patterns × 16×16
    const sprites: SpriteData[] = []
    for (let i = 0; i < 7; i++) {
      sprites.push(extractRegion(png, i * FLOOR_TILE_SIZE, 0, FLOOR_TILE_SIZE, FLOOR_TILE_SIZE))
    }
    return sprites
  } catch {
    return null
  }
}

export function loadWallTiles(assetsRoot: string): SpriteData[] | null {
  const p = path.join(assetsRoot, 'assets', 'walls.png')
  if (!fs.existsSync(p)) return null
  try {
    const buf = fs.readFileSync(p)
    const png = PNG.sync.read(buf)
    // 4×4 grid of 16×32 pieces
    const sprites: SpriteData[] = []
    for (let row = 0; row < WALL_GRID_COLS; row++) {
      for (let col = 0; col < WALL_GRID_COLS; col++) {
        sprites.push(
          extractRegion(png, col * WALL_PIECE_W, row * WALL_PIECE_H, WALL_PIECE_W, WALL_PIECE_H),
        )
      }
    }
    return sprites
  } catch {
    return null
  }
}

export interface FurnitureAsset {
  id: string
  name: string
  label: string
  category: string
  file: string
  width: number
  height: number
  footprintW: number
  footprintH: number
  isDesk: boolean
  canPlaceOnWalls: boolean
  partOfGroup?: boolean
  groupId?: string
  canPlaceOnSurfaces?: boolean
  backgroundTiles?: number
  orientation?: string
  state?: string
}

export interface LoadedFurnitureAssets {
  catalog: FurnitureAsset[]
  sprites: Record<string, SpriteData>
}

export function loadFurnitureAssets(assetsRoot: string): LoadedFurnitureAssets | null {
  const catalogPath = path.join(assetsRoot, 'assets', 'furniture', 'furniture-catalog.json')
  if (!fs.existsSync(catalogPath)) return null
  try {
    const raw = fs.readFileSync(catalogPath, 'utf-8')
    const data = JSON.parse(raw) as { assets?: FurnitureAsset[] }
    const catalog = data.assets ?? []
    const sprites: Record<string, SpriteData> = {}
    for (const asset of catalog) {
      let filePath = asset.file
      if (!filePath.startsWith('assets/')) {
        filePath = path.join('assets', 'furniture', path.basename(filePath))
      }
      const fullPath = path.join(assetsRoot, filePath)
      if (!fs.existsSync(fullPath)) continue
      const buf = fs.readFileSync(fullPath)
      const png = PNG.sync.read(buf)
      sprites[asset.id] = pngToSpriteData(png)
    }
    return { catalog, sprites }
  } catch {
    return null
  }
}
