import fs from 'fs'
import path from 'path'
import os from 'os'

const LAYOUT_DIR = path.join(os.homedir(), '.pixel-agents')
const LAYOUT_FILE = path.join(LAYOUT_DIR, 'layout.json')
const LAYOUT_TMP = path.join(LAYOUT_DIR, 'layout.json.tmp')

export function readLayout(): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(LAYOUT_FILE)) return null
    const raw = fs.readFileSync(LAYOUT_FILE, 'utf-8')
    const data = JSON.parse(raw) as Record<string, unknown>
    if (data.version !== 1 || !Array.isArray(data.tiles)) return null
    return data
  } catch {
    return null
  }
}

export function writeLayout(layout: Record<string, unknown>): void {
  try {
    if (!fs.existsSync(LAYOUT_DIR)) {
      fs.mkdirSync(LAYOUT_DIR, { recursive: true })
    }
    fs.writeFileSync(LAYOUT_TMP, JSON.stringify(layout, null, 2), 'utf-8')
    fs.renameSync(LAYOUT_TMP, LAYOUT_FILE)
  } catch (err) {
    console.error('[layoutStore] write failed:', err)
  }
}

/** Path to default layout file (e.g. public/assets/default-layout.json) for fallback */
export function getDefaultLayoutPath(assetsRoot: string): string {
  return path.join(assetsRoot, 'assets', 'default-layout.json')
}

export function loadDefaultLayout(assetsRoot: string): Record<string, unknown> | null {
  const p = getDefaultLayoutPath(assetsRoot)
  try {
    if (!fs.existsSync(p)) return null
    const raw = fs.readFileSync(p, 'utf-8')
    const data = JSON.parse(raw) as Record<string, unknown>
    if (data.version !== 1 || !Array.isArray(data.tiles)) return null
    return data
  } catch {
    return null
  }
}
