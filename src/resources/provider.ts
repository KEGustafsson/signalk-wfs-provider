import type { Cache } from '../cache/index.js'

// Signal K region resource shape expected by consumers (e.g. Freeboard-SK alarms plugin):
// { name, description, feature: GeoJSON.Feature, $source, timestamp }
interface SkRegion {
  name: string
  description?: string
  feature: GeoJSON.Feature
  $source: string
  timestamp: string
}

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
        result[id] = this.toSkRegion(feature, layer.providerId, layer.typeName, index, layer.fetchedAt)
      })
    }
    return result
  }

  async getResource(id: string): Promise<SkRegion | undefined> {
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

    return this.toSkRegion(feature, layer.providerId, typeName, index, layer.fetchedAt)
  }

  private toSkRegion(
    feature: GeoJSON.Feature,
    providerId: string,
    typeName: string,
    index: number,
    fetchedAt: Date,
  ): SkRegion {
    const props = feature.properties ?? {}
    const description =
      (props['description'] as string | undefined) ?? (props['kuvaus'] as string | undefined)
    return {
      name:
        (props['name'] as string | undefined) ??
        (props['nimi'] as string | undefined) ??
        `${typeName}:${index}`,
      ...(description !== undefined && { description }),
      feature,
      $source: `wfs-provider:${providerId}`,
      timestamp: fetchedAt.toISOString(),
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
