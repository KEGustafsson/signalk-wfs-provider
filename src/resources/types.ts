export interface WfsResource {
  type: 'FeatureCollection'
  features: GeoJSON.Feature[]
  $source: string
  timestamp: string
  bbox: [number, number, number, number]
  attribution?: string
  stale?: boolean
}
