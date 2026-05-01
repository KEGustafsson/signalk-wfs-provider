import type { Cache } from '../cache/index.js'

export class ResourceProvider {
  constructor(
    private readonly cache: Cache,
    private readonly resourceType: string,
  ) {}

  async listResources(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {}
    for (const layer of this.cache.getAll()) {
      const id = `${layer.providerId}:${layer.typeName}`
      result[id] = {
        $source: `wfs-provider:${layer.providerId}`,
        timestamp: layer.fetchedAt.toISOString(),
        bbox: layer.bbox,
        featureCount: layer.featureCollection.features.length,
      }
    }
    return result
  }

  async getResource(id: string): Promise<GeoJSON.FeatureCollection | undefined> {
    const colonIdx = id.indexOf(':')
    if (colonIdx === -1) return undefined
    const providerId = id.slice(0, colonIdx)
    const typeName = id.slice(colonIdx + 1)
    if (!providerId || !typeName) return undefined

    const layer = this.cache.get(providerId, typeName)
    if (!layer) return undefined

    return {
      ...layer.featureCollection,
      // @ts-expect-error Signal K resource metadata extensions
      $source: `wfs-provider:${layer.providerId}`,
      timestamp: layer.fetchedAt.toISOString(),
      bbox: layer.bbox,
    }
  }

  setResource(): never {
    const err = new Error('Method Not Allowed') as Error & { status?: number }
    err.status = 405
    throw err
  }

  deleteResource(): never {
    const err = new Error('Method Not Allowed') as Error & { status?: number }
    err.status = 405
    throw err
  }
}
