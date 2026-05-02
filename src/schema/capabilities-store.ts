import fs from 'node:fs'
import path from 'node:path'

export interface StoredLayer {
  name: string
  title: string
}

type Store = Record<string, StoredLayer[]>

export function capabilitiesStorePath(dataDir: string): string {
  return path.join(dataDir, 'wfs-provider-capabilities.json')
}

export function saveCapabilities(file: string, url: string, layers: StoredLayer[]): void {
  let store: Store = {}
  try {
    store = JSON.parse(fs.readFileSync(file, 'utf8')) as Store
  } catch {
    // file missing or corrupt — start fresh
  }
  store[url] = layers
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(store, null, 2))
}

export function loadAllLayers(file: string): StoredLayer[] {
  try {
    const store = JSON.parse(fs.readFileSync(file, 'utf8')) as Store
    const seen = new Set<string>()
    const result: StoredLayer[] = []
    for (const layers of Object.values(store)) {
      for (const layer of layers) {
        if (!seen.has(layer.name)) {
          seen.add(layer.name)
          result.push(layer)
        }
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}
