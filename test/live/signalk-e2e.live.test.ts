/**
 * End-to-end live test: real WFS fetch → Plugin cache → Signal K Resources API.
 *
 * Run with:  WFS_LIVE=true npx vitest run test/live --reporter=verbose
 *
 * What this tests:
 *  1. Plugin starts, calls GetCapabilities + GetFeature against live Traficom WFS.
 *  2. Features are stored in memory cache and SQLite.
 *  3. The registered Signal K resource provider returns them correctly via
 *     listResources() and getResource() — the exact calls Freeboard-SK makes.
 *  4. A second Plugin instance booted without network (fetch blocked) still
 *     serves the previously-cached data, proving offline persistence.
 */
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Plugin } from '../../src/plugin.js'
import type { PluginConfig } from '../../src/schema/config.js'

const LIVE = process.env.WFS_LIVE === 'true'

// ── Helpers ──────────────────────────────────────────────────────────────────

type ResourceMethods = {
  listResources: (query: unknown) => Promise<unknown>
  getResource: (id: string, query: unknown) => Promise<unknown>
  setResource: (id: string, value: unknown) => Promise<void>
  deleteResource: (id: string) => Promise<void>
}

function makeApp(label = '') {
  let registeredMethods: ResourceMethods | null = null

  const app = {
    debug: (m: string) => console.log(`  [${label}] debug: ${m}`),
    error: (m: string) => console.error(`  [${label}] ERROR: ${m}`),
    setPluginStatus: (m: string) => console.log(`  [${label}] status: ${m}`),
    setPluginError: (m: string) => console.error(`  [${label}] pluginError: ${m}`),
    handleMessage: (_id: string, _delta: unknown) => {},
    getDataDirPath: () => os.tmpdir(),
    registerResourceProvider(opts: { type: string; methods: ResourceMethods }) {
      registeredMethods = opts.methods
    },
    get methods(): ResourceMethods {
      if (!registeredMethods) throw new Error('registerResourceProvider not called yet')
      return registeredMethods
    },
  }

  return app
}

// Traficom provider config with two layers known to have data near Helsinki
const BBOX: [number, number, number, number] = [24.8, 59.9, 25.3, 60.3]

function makeConfig(cacheDir: string): PluginConfig {
  return {
    providers: [
      {
        id: 'traficom',
        url: 'https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs',
        version: '2.0.0',
        srs: 'EPSG:4326',
        layers: [
          { typeName: 'avoin:TerritorialSeaArea_A', label: 'Territorial sea areas', enabled: true, maxFeatures: 50 },
          { typeName: 'avoin:navigational_warnings_a', label: 'Navigational warnings', enabled: true, maxFeatures: 50 },
        ],
        bboxStrategy: 'static',
        staticBbox: BBOX,
        refreshIntervalSec: 3600,
        headers: { 'User-Agent': 'signalk-wfs-provider/e2e-test' },
      },
    ],
    cacheDir,
    resourceType: 'wfs-features',
  }
}

const tmpDirs: string[] = []
function makeTmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wfs-e2e-'))
  tmpDirs.push(d)
  return d
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe.skipIf(!LIVE)('Plugin end-to-end — live Traficom WFS → Signal K', { timeout: 90_000 }, () => {

  it('plugin starts, fetches WFS data and registers a resource provider', async () => {
    const cacheDir = makeTmpDir()
    const app = makeApp('start')
    const plugin = new Plugin(app as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')

    await plugin.start(makeConfig(cacheDir))

    // Signal K registration happened
    expect(() => app.methods).not.toThrow()

    plugin.stop()
  })

  it('listResources() returns both configured layers with metadata', async () => {
    const cacheDir = makeTmpDir()
    const app = makeApp('list')
    const plugin = new Plugin(app as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')

    await plugin.start(makeConfig(cacheDir))

    const resources = await app.methods.listResources({}) as Record<string, unknown>

    console.log('  Resources listed by SK provider:')
    for (const [id, meta] of Object.entries(resources)) {
      const m = meta as Record<string, unknown>
      console.log(`    • ${id}  (${m.featureCount} features, bbox: ${JSON.stringify(m.bbox)})`)
    }

    // Both layers must be present
    expect(resources['traficom:avoin:TerritorialSeaArea_A']).toBeDefined()
    expect(resources['traficom:avoin:navigational_warnings_a']).toBeDefined()

    // Metadata shape
    const meta = resources['traficom:avoin:TerritorialSeaArea_A'] as Record<string, unknown>
    expect(meta.$source).toBe('wfs-provider:traficom')
    expect(typeof meta.timestamp).toBe('string')
    expect(new Date(meta.timestamp as string).getTime()).toBeGreaterThan(0)
    expect(Array.isArray(meta.bbox)).toBe(true)
    expect(typeof meta.featureCount).toBe('number')

    plugin.stop()
  })

  it('getResource() returns a valid GeoJSON FeatureCollection for TerritorialSeaArea_A', async () => {
    const cacheDir = makeTmpDir()
    const app = makeApp('get')
    const plugin = new Plugin(app as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')

    await plugin.start(makeConfig(cacheDir))

    const fc = await app.methods.getResource('traficom:avoin:TerritorialSeaArea_A', {}) as GeoJSON.FeatureCollection & Record<string, unknown>

    expect(fc).toBeDefined()
    expect(fc.type).toBe('FeatureCollection')
    expect(Array.isArray(fc.features)).toBe(true)
    expect(fc.features.length).toBeGreaterThan(0)

    // Signal K metadata extensions must be present
    expect(fc.$source).toBe('wfs-provider:traficom')
    expect(typeof fc.timestamp).toBe('string')
    expect(Array.isArray(fc.bbox)).toBe(true)

    // Each feature must be valid GeoJSON
    for (const f of fc.features) {
      expect(f.type).toBe('Feature')
      expect(f.geometry).toBeDefined()
    }

    console.log(
      `  TerritorialSeaArea_A: ${fc.features.length} features, ` +
      `first geometry type: ${fc.features[0].geometry?.type}`,
    )

    plugin.stop()
  })

  it('getResource() returns undefined for an unknown resource ID', async () => {
    const cacheDir = makeTmpDir()
    const app = makeApp('unknown')
    const plugin = new Plugin(app as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')

    await plugin.start(makeConfig(cacheDir))

    const result = await app.methods.getResource('traficom:avoin:nonexistent_layer', {})
    expect(result).toBeUndefined()

    plugin.stop()
  })

  it('setResource() and deleteResource() are rejected with 405', async () => {
    const cacheDir = makeTmpDir()
    const app = makeApp('readonly')
    const plugin = new Plugin(app as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')

    await plugin.start(makeConfig(cacheDir))

    await expect(app.methods.setResource('traficom:avoin:TerritorialSeaArea_A', {}))
      .rejects.toThrow('Method Not Allowed')
    await expect(app.methods.deleteResource('traficom:avoin:TerritorialSeaArea_A'))
      .rejects.toThrow('Method Not Allowed')

    plugin.stop()
  })

  it('data persists in SQLite and is served correctly after plugin restart without network', async () => {
    const cacheDir = makeTmpDir()

    // First run — fetch from live network
    const app1 = makeApp('run1')
    const plugin1 = new Plugin(app1 as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')
    await plugin1.start(makeConfig(cacheDir))

    const liveList = await app1.methods.listResources({}) as Record<string, unknown>
    const liveCount = (liveList['traficom:avoin:TerritorialSeaArea_A'] as Record<string, unknown>).featureCount as number
    expect(liveCount).toBeGreaterThan(0)
    console.log(`  Run 1 (live): ${liveCount} features fetched and cached`)

    plugin1.stop()

    // Second run — block the network, plugin must serve from SQLite
    const realFetch = globalThis.fetch
    globalThis.fetch = () => Promise.reject(new Error('Network blocked for offline test'))

    try {
      const app2 = makeApp('run2')
      const plugin2 = new Plugin(app2 as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')
      await plugin2.start(makeConfig(cacheDir))

      const offlineList = await app2.methods.listResources({}) as Record<string, unknown>
      const offlineMeta = offlineList['traficom:avoin:TerritorialSeaArea_A'] as Record<string, unknown>
      expect(offlineMeta).toBeDefined()
      expect(offlineMeta.featureCount).toBe(liveCount)

      const offlineFc = await app2.methods.getResource('traficom:avoin:TerritorialSeaArea_A', {}) as GeoJSON.FeatureCollection
      expect(offlineFc.features.length).toBe(liveCount)

      console.log(`  Run 2 (offline): ${offlineFc.features.length} features served from SQLite cache ✓`)

      plugin2.stop()
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
