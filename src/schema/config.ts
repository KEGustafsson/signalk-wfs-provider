export interface LayerConfig {
  typeName: string
  label?: string
  enabled: boolean
  maxFeatures?: number
}

export interface ProviderConfig {
  id: string
  label?: string
  url: string
  version?: string
  srs?: string
  layers: LayerConfig[]
  bboxStrategy: 'static' | 'follow-vessel'
  staticBbox?: [number, number, number, number] | null
  vesselBboxRadiusNm?: number
  refreshIntervalSec?: number
  minMoveDistanceNm?: number
  headers?: Record<string, string>
}

export interface PluginConfig {
  providers: ProviderConfig[]
  cacheDir?: string
  resourceType?: string
}

export const configSchema = {
  type: 'object',
  required: ['providers'],
  properties: {
    providers: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'url', 'layers', 'bboxStrategy'],
        properties: {
          id: { type: 'string', minLength: 1, pattern: '^[^:]+$' },
          label: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          version: { type: 'string', default: '2.0.0' },
          srs: { type: 'string', default: 'EPSG:4326' },
          layers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['typeName', 'enabled'],
              properties: {
                typeName: { type: 'string', minLength: 1 },
                label: { type: 'string' },
                enabled: { type: 'boolean' },
                maxFeatures: { type: 'integer', minimum: 1, maximum: 100000 },
              },
            },
          },
          bboxStrategy: { type: 'string', enum: ['static', 'follow-vessel'] },
          staticBbox: {
            oneOf: [
              {
                type: 'array',
                minItems: 4,
                maxItems: 4,
                items: [
                  { type: 'number', minimum: -180, maximum: 180 },
                  { type: 'number', minimum: -90, maximum: 90 },
                  { type: 'number', minimum: -180, maximum: 180 },
                  { type: 'number', minimum: -90, maximum: 90 },
                ],
              },
              { type: 'null' },
            ],
          },
          vesselBboxRadiusNm: { type: 'number', minimum: 1, default: 30 },
          refreshIntervalSec: { type: 'integer', minimum: 60, default: 3600 },
          minMoveDistanceNm: { type: 'number', minimum: 0.1, default: 5 },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      },
    },
    cacheDir: { type: 'string' },
    resourceType: { type: 'string', default: 'wfs-features' },
  },
}
