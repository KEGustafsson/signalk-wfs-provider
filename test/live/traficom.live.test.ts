/**
 * Live integration test against the Traficom open-data WFS endpoint.
 * Run with:  WFS_LIVE=true npx vitest run test/live
 *
 * Skipped automatically in CI unless WFS_LIVE=true is set.
 *
 * Layer names all carry the `avoin:` namespace prefix on this server.
 * Reference: https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs
 */
import { describe, it, expect } from 'vitest'
import { WfsClient } from '../../src/wfs/client.js'
import { supportsGeoJson } from '../../src/wfs/capabilities.js'
import type { ProviderConfig } from '../../src/schema/config.js'

const LIVE = process.env.WFS_LIVE === 'true'

const traficomCfg: ProviderConfig = {
  id: 'traficom',
  url: 'https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs',
  version: '2.0.0',
  srs: 'EPSG:4326',
  layers: [],
  bboxStrategy: 'static',
  headers: { 'User-Agent': 'signalk-wfs-provider/test' },
}

// Helsinki / Gulf of Finland bbox — small enough to be fast, dense enough for features
const BBOX: [number, number, number, number] = [24.8, 59.9, 25.3, 60.3]

describe.skipIf(!LIVE)('Traficom WFS — live network', { timeout: 60_000 }, () => {
  const client = new WfsClient(traficomCfg)

  it('GetCapabilities returns a valid layer list with GeoJSON support', async () => {
    const caps = await client.getCapabilities()

    expect(caps.version).toBe('2.0.0')
    expect(caps.layers.length).toBeGreaterThan(0)

    const jsonLayers = caps.layers.filter(supportsGeoJson)
    expect(jsonLayers.length).toBeGreaterThan(0)

    console.log(`  ${caps.layers.length} total layers, ${jsonLayers.length} support GeoJSON`)
    jsonLayers.slice(0, 8).forEach((l) =>
      console.log(`  • ${l.name} — ${l.title}`),
    )

    // All layer names on this server are namespaced avoin:<name>
    expect(caps.layers.every((l) => l.name.includes(':'))).toBe(true)
  })

  it('GetFeature returns ≥1 feature for avoin:TerritorialSeaArea_A in Helsinki bbox', async () => {
    const result = await client.getFeature({
      typeName: 'avoin:TerritorialSeaArea_A',
      bbox: BBOX,
      bboxSrs: 'EPSG:4326',
      outputSrs: 'EPSG:4326',
      count: 50,
    })

    expect(result.notModified).toBe(false)
    expect(result.featureCollection).toBeDefined()
    expect(result.featureCollection!.type).toBe('FeatureCollection')
    expect(result.featureCollection!.features.length).toBeGreaterThan(0)

    const first = result.featureCollection!.features[0]
    expect(first.type).toBe('Feature')
    expect(first.geometry).toBeDefined()

    console.log(`  avoin:TerritorialSeaArea_A: ${result.featureCollection!.features.length} features`)
  })

  it('GetFeature returns features for avoin:navigational_warnings_a', async () => {
    const result = await client.getFeature({
      typeName: 'avoin:navigational_warnings_a',
      bbox: BBOX,
      bboxSrs: 'EPSG:4326',
      outputSrs: 'EPSG:4326',
      count: 100,
    })

    expect(result.notModified).toBe(false)
    expect(result.featureCollection).toBeDefined()

    const count = result.featureCollection!.features.length
    console.log(`  avoin:navigational_warnings_a: ${count} features (may be 0 if no active warnings)`)
    // This layer may legitimately be empty if there are no active warnings
    expect(Array.isArray(result.featureCollection!.features)).toBe(true)
  })

  it('conditional GET returns 304 or fresh data on second request', async () => {
    const first = await client.getFeature({
      typeName: 'avoin:TerritorialSeaArea_A',
      bbox: BBOX,
      bboxSrs: 'EPSG:4326',
      outputSrs: 'EPSG:4326',
      count: 10,
    })

    expect(first.notModified).toBe(false)

    const second = await client.getFeature({
      typeName: 'avoin:TerritorialSeaArea_A',
      bbox: BBOX,
      bboxSrs: 'EPSG:4326',
      outputSrs: 'EPSG:4326',
      count: 10,
      ifNoneMatch: first.etag,
      ifModifiedSince: first.lastModified,
    })

    if (second.notModified) {
      console.log('  Conditional GET: 304 Not Modified ✓')
    } else {
      console.log('  Conditional GET: 200 (server does not support conditional requests)')
    }
    expect(second.notModified || second.featureCollection !== undefined).toBe(true)
  })

  it('dynamically fetches first available GeoJSON layer from capabilities', async () => {
    const caps = await client.getCapabilities()
    const layer = caps.layers.filter(supportsGeoJson).find((l) =>
      // Skip product-index layers (tuotejako_*) which may return large results
      !l.name.includes('tuotejako'),
    )
    expect(layer).toBeDefined()

    const result = await client.getFeature({
      typeName: layer!.name,
      bbox: BBOX,
      bboxSrs: 'EPSG:4326',
      outputSrs: 'EPSG:4326',
      count: 20,
    })

    expect(result.notModified).toBe(false)
    expect(result.featureCollection).toBeDefined()
    console.log(
      `  Dynamic layer ${layer!.name}: ${result.featureCollection!.features.length} features`,
    )
  })
})
