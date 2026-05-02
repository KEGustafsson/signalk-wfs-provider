import { describe, it, expect } from 'vitest'
import { ResourceProvider } from '../../src/resources/provider.js'
import { Cache } from '../../src/cache/index.js'
import type { CachedLayer } from '../../src/cache/index.js'

const makeLayer = (providerId: string, typeName: string): CachedLayer => ({
  providerId,
  typeName,
  featureCollection: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [25, 60] },
        properties: { id: '1' },
      },
    ],
  },
  fetchedAt: new Date('2024-01-01'),
  bbox: [19, 59, 32, 70],
})

describe('ResourceProvider', () => {
  it('listResources returns all layers', async () => {
    const cache = new Cache()
    cache.set(makeLayer('traficom', 'rajoitusalue_a'))
    cache.set(makeLayer('traficom', 'syvyyskayra_v'))
    const provider = new ResourceProvider(cache, 'wfs-features')

    const result = await provider.listResources()
    expect(Object.keys(result)).toHaveLength(2)
    expect(result['traficom:rajoitusalue_a']).toBeDefined()
  })

  it('getResource returns feature collection', async () => {
    const cache = new Cache()
    cache.set(makeLayer('traficom', 'rajoitusalue_a'))
    const provider = new ResourceProvider(cache, 'wfs-features')

    const result = await provider.getResource('traficom:rajoitusalue_a')
    expect(result).toBeDefined()
    expect(result!.type).toBe('FeatureCollection')
    expect(result!.features).toHaveLength(1)
  })

  it('getResource returns undefined for unknown id', async () => {
    const cache = new Cache()
    const provider = new ResourceProvider(cache, 'wfs-features')
    expect(await provider.getResource('unknown:layer')).toBeUndefined()
  })

  it('getResource resolves namespaced typeName (provider:ns:layer)', async () => {
    const cache = new Cache()
    cache.set(makeLayer('traficom', 'inspire:depth_areas'))
    const provider = new ResourceProvider(cache, 'wfs-features')

    const result = await provider.getResource('traficom:inspire:depth_areas')
    expect(result).toBeDefined()
    expect(result!.type).toBe('FeatureCollection')
  })

  it('getResource returns undefined for id with no colon', async () => {
    const cache = new Cache()
    const provider = new ResourceProvider(cache, 'wfs-features')
    expect(await provider.getResource('nocolon')).toBeUndefined()
  })

  it('setResource throws 405', () => {
    const cache = new Cache()
    const provider = new ResourceProvider(cache, 'wfs-features')
    expect(() => provider.setResource()).toThrow('Method Not Allowed')
  })

  it('deleteResource throws 405', () => {
    const cache = new Cache()
    const provider = new ResourceProvider(cache, 'wfs-features')
    expect(() => provider.deleteResource()).toThrow('Method Not Allowed')
  })
})
