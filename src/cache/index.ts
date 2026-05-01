import type GeoJSON from 'geojson'
import type { Bbox } from '../bbox/geometry.js'

export interface CachedLayer {
  providerId: string
  typeName: string
  featureCollection: GeoJSON.FeatureCollection
  fetchedAt: Date
  bbox: Bbox
  etag?: string
  lastModified?: string
}

export class Cache {
  private layers = new Map<string, CachedLayer>()

  private key(providerId: string, typeName: string): string {
    return `${providerId}:${typeName}`
  }

  set(layer: CachedLayer): void {
    this.layers.set(this.key(layer.providerId, layer.typeName), layer)
  }

  get(providerId: string, typeName: string): CachedLayer | undefined {
    return this.layers.get(this.key(providerId, typeName))
  }

  getAll(): CachedLayer[] {
    return Array.from(this.layers.values())
  }

  delete(providerId: string, typeName: string): void {
    this.layers.delete(this.key(providerId, typeName))
  }

  has(providerId: string, typeName: string): boolean {
    return this.layers.has(this.key(providerId, typeName))
  }

  size(): number {
    return this.layers.size
  }
}
