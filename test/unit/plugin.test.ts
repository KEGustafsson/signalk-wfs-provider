import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Plugin } from '../../src/plugin.js'
import type { PluginConfig } from '../../src/schema/config.js'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const tmpDir = path.join(os.tmpdir(), `wfs-test-${Date.now()}`)

const makeApp = () => ({
  debug: vi.fn(),
  error: vi.fn(),
  registerResourceProvider: vi.fn(),
  setPluginStatus: vi.fn(),
  setPluginError: vi.fn(),
  handleMessage: vi.fn(),
  getDataDirPath: () => tmpDir,
})

const minimalConfig: PluginConfig = {
  providers: [
    {
      id: 'test',
      url: 'https://example.com/wfs',
      layers: [],
      bboxStrategy: 'static',
    },
  ],
  cacheDir: tmpDir,
}

const followVesselConfig: PluginConfig = {
  providers: [
    {
      id: 'test',
      url: 'https://example.com/wfs',
      layers: [{ typeName: 'depth_areas', enabled: true, maxFeatures: 100 }],
      bboxStrategy: 'follow-vessel',
      // no staticBbox — position not yet known
    },
  ],
  cacheDir: tmpDir,
}

const capabilitiesXml = `<?xml version="1.0"?>
<wfs:WFS_Capabilities version="2.0.0"
  xmlns:wfs="http://www.opengis.net/wfs/2.0"
  xmlns:ows="http://www.opengis.net/ows/1.1">
  <ows:OperationsMetadata>
    <ows:Operation name="GetFeature">
      <ows:Parameter name="outputFormat">
        <ows:AllowedValues><ows:Value>application/json</ows:Value></ows:AllowedValues>
      </ows:Parameter>
    </ows:Operation>
  </ows:OperationsMetadata>
  <wfs:FeatureTypeList>
    <wfs:FeatureType>
      <wfs:Name>depth_areas</wfs:Name>
      <wfs:Title>Depth areas</wfs:Title>
      <wfs:DefaultCRS>urn:ogc:def:crs:EPSG::4326</wfs:DefaultCRS>
    </wfs:FeatureType>
  </wfs:FeatureTypeList>
</wfs:WFS_Capabilities>`

const featureCollection = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [25, 60] }, properties: {} }],
}

function makeFetch(responses: Array<{ ok: boolean; status: number; body: string; contentType?: string }>) {
  let call = 0
  return vi.fn().mockImplementation(() => {
    const r = responses[Math.min(call++, responses.length - 1)]
    return Promise.resolve({
      ok: r.ok,
      status: r.status,
      text: async () => r.body,
      json: async () => JSON.parse(r.body),
      headers: { get: (h: string) => (h === 'content-type' ? (r.contentType ?? 'application/json') : null) },
    })
  })
}

describe('Plugin', () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers resource provider on start', async () => {
    const app = makeApp()

    // Mock fetch for capabilities
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
      headers: { get: () => null },
    } as unknown as Response)

    const plugin = new Plugin(app as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')
    await plugin.start(minimalConfig)

    expect(app.registerResourceProvider).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'wfs-features' }),
    )

    plugin.stop()
  })

  it('does not fetch when follow-vessel and no position or staticBbox', async () => {
    const app = makeApp()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
      headers: { get: () => null },
    } as unknown as Response)
    global.fetch = fetchMock

    const plugin = new Plugin(app as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')
    await plugin.start(followVesselConfig)

    // GetCapabilities is called (one fetch), but GetFeature must NOT be called
    // because no position is available and staticBbox is absent
    const getFeatureCalls = fetchMock.mock.calls.filter((args: string[]) =>
      String(args[0]).includes('GetFeature'),
    )
    expect(getFeatureCalls).toHaveLength(0)

    plugin.stop()
  })

  it('fetches layer and caches features on successful GetFeature', async () => {
    const app = makeApp()
    global.fetch = makeFetch([
      { ok: true, status: 200, body: capabilitiesXml, contentType: 'text/xml' },
      { ok: true, status: 200, body: JSON.stringify(featureCollection) },
    ])

    const cfg: PluginConfig = {
      providers: [
        {
          id: 'test',
          url: 'https://example.com/wfs',
          layers: [{ typeName: 'depth_areas', enabled: true, maxFeatures: 100 }],
          bboxStrategy: 'static',
          staticBbox: [19, 59, 32, 70],
        },
      ],
      cacheDir: tmpDir,
    }

    const plugin = new Plugin(app as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')
    await plugin.start(cfg)

    expect(app.debug).toHaveBeenCalledWith(
      expect.stringContaining('fetched 1 features'),
    )

    plugin.stop()
  })

  it('emits notification and logs error when GetFeature fails', async () => {
    const app = makeApp()
    global.fetch = makeFetch([
      { ok: true, status: 200, body: capabilitiesXml, contentType: 'text/xml' },
      { ok: false, status: 503, body: 'unavailable' },
    ])

    const cfg: PluginConfig = {
      providers: [
        {
          id: 'test',
          url: 'https://example.com/wfs',
          layers: [{ typeName: 'depth_areas', enabled: true }],
          bboxStrategy: 'static',
          staticBbox: [19, 59, 32, 70],
        },
      ],
      cacheDir: tmpDir,
    }

    const plugin = new Plugin(app as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')
    await plugin.start(cfg)

    expect(app.error).toHaveBeenCalledWith(expect.stringContaining('fetch failed'))
    expect(app.handleMessage).toHaveBeenCalled()

    plugin.stop()
  })

  it('stops cleanly with active timers and managers', async () => {
    const app = makeApp()
    global.fetch = makeFetch([
      { ok: true, status: 200, body: capabilitiesXml, contentType: 'text/xml' },
      { ok: true, status: 200, body: JSON.stringify(featureCollection) },
    ])

    const cfg: PluginConfig = {
      providers: [
        {
          id: 'test',
          url: 'https://example.com/wfs',
          layers: [{ typeName: 'depth_areas', enabled: true }],
          bboxStrategy: 'follow-vessel',
          staticBbox: [19, 59, 32, 70],
          refreshIntervalSec: 3600,
        },
      ],
      cacheDir: tmpDir,
    }

    const plugin = new Plugin(app as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')
    await plugin.start(cfg)
    expect(() => plugin.stop()).not.toThrow()
  })
})
