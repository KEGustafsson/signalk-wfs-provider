import type { Cache } from '../cache/index.js'

export class ResourceProvider {
  constructor(
    private readonly cache: Cache,
    private readonly resourceType: string,
  ) {}

  async listResources(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {}
    for (const layer of this.cache.getAll()) {
      layer.featureCollection.features.forEach((feature, index) => {
        const id = `${layer.providerId}:${layer.typeName}:${index}`
        const name =
          (feature.properties?.['name'] as string | undefined) ??
          (feature.properties?.['Name'] as string | undefined) ??
          `${layer.typeName}:${index}`
        result[id] = {
          $source: `wfs-provider:${layer.providerId}`,
          timestamp: layer.fetchedAt.toISOString(),
          name,
          description: layer.typeName,
        }
      })
    }
    return result
  }

  async getResource(id: string): Promise<GeoJSON.Feature | undefined> {
    // ID format: <providerId>:<typeName>:<featureIndex>
    // providerId has no colons (schema enforced); index is after the last colon;
    // typeName is everything in between.
    const firstColon = id.indexOf(':')
    if (firstColon === -1) return undefined
    const providerId = id.slice(0, firstColon)
    const rest = id.slice(firstColon + 1)
    const lastColon = rest.lastIndexOf(':')
    if (lastColon === -1) return undefined
    const typeName = rest.slice(0, lastColon)
    const indexStr = rest.slice(lastColon + 1)
    const index = Number.parseInt(indexStr, 10)
    if (!providerId || !typeName || Number.isNaN(index)) return undefined

    const layer = this.cache.get(providerId, typeName)
    if (!layer) return undefined

    const feature = layer.featureCollection.features[index]
    if (!feature) return undefined

    return {
      ...feature,
      // @ts-expect-error Signal K resource metadata extensions
      $source: `wfs-provider:${layer.providerId}`,
      timestamp: layer.fetchedAt.toISOString(),
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
