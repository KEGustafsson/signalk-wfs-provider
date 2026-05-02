export interface CapabilityLayer {
  name: string
  title: string
  defaultCRS: string
  otherCRS: string[]
  wgs84BoundingBox?: [number, number, number, number]
  outputFormats: string[]
}

export interface Capabilities {
  version: string
  layers: CapabilityLayer[]
}

export interface GetFeatureOptions {
  typeName: string
  bbox?: [number, number, number, number]
  bboxSrs?: string
  outputSrs?: string
  count?: number
  startIndex?: number
  filter?: string
  ifModifiedSince?: string
  ifNoneMatch?: string
}

export interface GetFeatureResult {
  notModified: boolean
  featureCollection?: GeoJSON.FeatureCollection
  etag?: string
  lastModified?: string
}

export class WfsServerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'WfsServerError'
  }
}
