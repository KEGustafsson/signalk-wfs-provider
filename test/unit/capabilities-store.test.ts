import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { saveCapabilities, loadAllLayers, capabilitiesStorePath } from '../../src/schema/capabilities-store.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caps-store-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('capabilities-store', () => {
  it('capabilitiesStorePath returns path inside dataDir', () => {
    expect(capabilitiesStorePath('/data')).toBe('/data/wfs-provider-capabilities.json')
  })

  it('loadAllLayers returns empty array when file does not exist', () => {
    expect(loadAllLayers(path.join(tmpDir, 'missing.json'))).toEqual([])
  })

  it('saveCapabilities creates file and loadAllLayers returns sorted layers', () => {
    const file = path.join(tmpDir, 'caps.json')
    saveCapabilities(file, 'https://example.com/wfs', [
      { name: 'layer:B', title: 'Layer B' },
      { name: 'layer:A', title: 'Layer A' },
    ])

    const layers = loadAllLayers(file)
    expect(layers).toHaveLength(2)
    expect(layers[0].name).toBe('layer:A')
    expect(layers[1].name).toBe('layer:B')
  })

  it('saveCapabilities merges layers from multiple URLs without duplicates', () => {
    const file = path.join(tmpDir, 'caps.json')
    saveCapabilities(file, 'https://url1.com', [
      { name: 'shared:layer', title: 'Shared' },
      { name: 'url1:layer', title: 'URL1 only' },
    ])
    saveCapabilities(file, 'https://url2.com', [
      { name: 'shared:layer', title: 'Shared' },
      { name: 'url2:layer', title: 'URL2 only' },
    ])

    const layers = loadAllLayers(file)
    expect(layers).toHaveLength(3)
    expect(layers.map((l) => l.name)).toContain('shared:layer')
    expect(layers.map((l) => l.name)).toContain('url1:layer')
    expect(layers.map((l) => l.name)).toContain('url2:layer')
  })

  it('saveCapabilities overwrites existing entry for same URL', () => {
    const file = path.join(tmpDir, 'caps.json')
    saveCapabilities(file, 'https://example.com', [{ name: 'old:layer', title: 'Old' }])
    saveCapabilities(file, 'https://example.com', [{ name: 'new:layer', title: 'New' }])

    const layers = loadAllLayers(file)
    expect(layers).toHaveLength(1)
    expect(layers[0].name).toBe('new:layer')
  })

  it('loadAllLayers returns empty array on corrupt file', () => {
    const file = path.join(tmpDir, 'corrupt.json')
    fs.writeFileSync(file, 'not valid json')
    expect(loadAllLayers(file)).toEqual([])
  })
})
