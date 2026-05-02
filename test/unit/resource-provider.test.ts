import { describe, it, expect } from 'vitest'
import { ResourceProvider } from '../../src/resources/provider.js'
import { Cache } from '../../src/cache/index.js'
import type { CachedLayer } from '../../src/cache/index.js'

const makeLayer = (providerId: string, typeName: string, features: GeoJSON.Feature[] = []): CachedLayer => ({
  providerId,
  typeName,
  featureCollection: { type: 'FeatureCollection', features },
  fetchedAt: new Date('2024-01-01'),
  bbox: [19, 59, 32, 70],
})

const makeFeature = (props: Record<string, unknown> = {}): GeoJSON.Feature => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[25, 60], [26, 60], [26, 61], [25, 60]]] },
  properties: props,
})

describe('ResourceProvider', () => {
  it('listResources returns one entry per feature across all layers', async () => {
    const cache = new Cache()
    cache.set(makeLayer('traficom', 'avoin:TerritorialSeaArea_A', [makeFeature(), makeFeature()]))
    cache.set(makeLayer('traficom', 'avoin:rajoitusalue_a', [makeFeature()]))
    const provider = new ResourceProvider(cache, 'regions')

    const result = await provider.listResources()
    expect(Object.keys(result)).toHaveLength(3)
    expect(result['traficom:avoin:TerritorialSeaArea_A:0']).toBeDefined()
    expect(result['traficom:avoin:TerritorialSeaArea_A:1']).toBeDefined()
    expect(result['traficom:avoin:rajoitusalue_a:0']).toBeDefined()
  })

  it('listResources entries are full GeoJSON Features with SK metadata', async () => {
    const cache = new Cache()
    cache.set(makeLayer('p', 'layer', [makeFeature({ name: 'My Area' })]))
    const provider = new ResourceProvider(cache, 'regions')

    const result = await provider.listResources()
    const entry = result['p:layer:0'] as Record<string, unknown>
    expect(entry.type).toBe('Feature')
    expect(entry.geometry).toBeDefined()
    expect((entry.properties as Record<string, unknown>).name).toBe('My Area')
    expect(entry.$source).toBe('wfs-provider:p')
    expect(typeof entry.timestamp).toBe('string')
  })

  it('listResources returns empty object when all layers have 0 features', async () => {
    const cache = new Cache()
    cache.set(makeLayer('p', 'empty_layer', []))
    const provider = new ResourceProvider(cache, 'regions')
    expect(await provider.listResources()).toEqual({})
  })

  it('getResource returns a GeoJSON Feature for a valid id', async () => {
    const cache = new Cache()
    cache.set(makeLayer('traficom', 'avoin:TerritorialSeaArea_A', [makeFeature({ id: 42 })]))
    const provider = new ResourceProvider(cache, 'regions')

    const result = await provider.getResource('traficom:avoin:TerritorialSeaArea_A:0')
    expect(result).toBeDefined()
    expect(result!.type).toBe('Feature')
    expect(result!.geometry.type).toBe('Polygon')
    expect(result!.properties?.['id']).toBe(42)
  })

  it('getResource includes Signal K metadata extensions', async () => {
    const cache = new Cache()
    cache.set(makeLayer('traficom', 'avoin:TerritorialSeaArea_A', [makeFeature()]))
    const provider = new ResourceProvider(cache, 'regions')

    const result = await provider.getResource('traficom:avoin:TerritorialSeaArea_A:0') as Record<string, unknown>
    expect(result['$source']).toBe('wfs-provider:traficom')
    expect(typeof result['timestamp']).toBe('string')
  })

  it('getResource handles non-namespaced typeName (provider:layer:index)', async () => {
    const cache = new Cache()
    cache.set(makeLayer('traficom', 'rajoitusalue_a', [makeFeature()]))
    const provider = new ResourceProvider(cache, 'regions')

    const result = await provider.getResource('traficom:rajoitusalue_a:0')
    expect(result).toBeDefined()
    expect(result!.type).toBe('Feature')
  })

  it('getResource handles namespaced typeName (provider:ns:layer:index)', async () => {
    const cache = new Cache()
    cache.set(makeLayer('traficom', 'avoin:depth_areas', [makeFeature()]))
    const provider = new ResourceProvider(cache, 'regions')

    const result = await provider.getResource('traficom:avoin:depth_areas:0')
    expect(result).toBeDefined()
    expect(result!.type).toBe('Feature')
  })

  it('getResource returns undefined for out-of-range index', async () => {
    const cache = new Cache()
    cache.set(makeLayer('p', 'layer', [makeFeature()]))
    const provider = new ResourceProvider(cache, 'regions')
    expect(await provider.getResource('p:layer:99')).toBeUndefined()
  })

  it('getResource returns undefined for unknown layer', async () => {
    const cache = new Cache()
    const provider = new ResourceProvider(cache, 'regions')
    expect(await provider.getResource('p:unknown:0')).toBeUndefined()
  })

  it('getResource returns undefined for id with no colon', async () => {
    const cache = new Cache()
    const provider = new ResourceProvider(cache, 'regions')
    expect(await provider.getResource('nocolon')).toBeUndefined()
  })

  it('getResource returns undefined for id missing index segment', async () => {
    const cache = new Cache()
    cache.set(makeLayer('p', 'layer', [makeFeature()]))
    const provider = new ResourceProvider(cache, 'regions')
    // Old-style id with no trailing index — should return undefined
    expect(await provider.getResource('p:layer')).toBeUndefined()
  })

  it('setResource throws 405', () => {
    const provider = new ResourceProvider(new Cache(), 'regions')
    expect(() => provider.setResource()).toThrow('Method Not Allowed')
  })

  it('deleteResource throws 405', () => {
    const provider = new ResourceProvider(new Cache(), 'regions')
    expect(() => provider.deleteResource()).toThrow('Method Not Allowed')
  })
})
