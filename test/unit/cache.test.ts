import { describe, it, expect } from 'vitest'
import { Cache } from '../../src/cache/index.js'
import type { CachedLayer } from '../../src/cache/index.js'

const makeLayer = (providerId: string, typeName: string): CachedLayer => ({
  providerId,
  typeName,
  featureCollection: { type: 'FeatureCollection', features: [] },
  fetchedAt: new Date('2024-01-01'),
  bbox: [19, 59, 32, 70],
})

describe('Cache', () => {
  it('stores and retrieves a layer', () => {
    const cache = new Cache()
    const layer = makeLayer('traficom', 'rajoitusalue_a')
    cache.set(layer)
    expect(cache.get('traficom', 'rajoitusalue_a')).toEqual(layer)
  })

  it('returns undefined for missing layer', () => {
    const cache = new Cache()
    expect(cache.get('unknown', 'layer')).toBeUndefined()
  })

  it('getAll returns all layers', () => {
    const cache = new Cache()
    cache.set(makeLayer('p1', 'l1'))
    cache.set(makeLayer('p1', 'l2'))
    cache.set(makeLayer('p2', 'l1'))
    expect(cache.getAll()).toHaveLength(3)
  })

  it('overwrites existing layer on set', () => {
    const cache = new Cache()
    cache.set(makeLayer('p', 'l'))
    const updated: CachedLayer = {
      ...makeLayer('p', 'l'),
      fetchedAt: new Date('2024-06-01'),
    }
    cache.set(updated)
    expect(cache.get('p', 'l')!.fetchedAt).toEqual(new Date('2024-06-01'))
  })

  it('has() returns correct presence', () => {
    const cache = new Cache()
    cache.set(makeLayer('p', 'l'))
    expect(cache.has('p', 'l')).toBe(true)
    expect(cache.has('p', 'x')).toBe(false)
  })

  it('delete() removes layer', () => {
    const cache = new Cache()
    cache.set(makeLayer('p', 'l'))
    cache.delete('p', 'l')
    expect(cache.has('p', 'l')).toBe(false)
  })
})
