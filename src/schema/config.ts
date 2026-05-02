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

// buildConfigSchema generates the JSON Schema, optionally enriching typeName
// with an enum and auto-filling label via if/then conditionals.
export function buildConfigSchema(knownLayers: { name: string; title: string }[] = []) {
  const typeNameSchema =
    knownLayers.length > 0
      ? {
          type: 'string',
          enum: knownLayers.map((l) => l.name),
          enumNames: knownLayers.map((l) => (l.title !== l.name ? `${l.title} (${l.name})` : l.name)),
        }
      : { type: 'string', minLength: 1 }

  // if/then conditionals: when typeName matches a known layer, set the label default.
  // react-jsonschema-form applies these defaults when the condition becomes true.
  const labelConditionals = knownLayers.map((l) => ({
    if: { properties: { typeName: { const: l.name } }, required: ['typeName'] },
    then: { properties: { label: { default: l.title } } },
  }))

  return buildSchemaWith(typeNameSchema, labelConditionals)
}

// Static export kept for backwards compatibility and tests
export const configSchema = buildSchemaWith({ type: 'string', minLength: 1 }, [])

function buildSchemaWith(typeNameSchema: object, labelConditionals: object[]) {
  const layerItemSchema: Record<string, unknown> = {
    type: 'object',
    required: ['typeName', 'enabled'],
    properties: {
      typeName: typeNameSchema,
      label: { type: 'string' },
      enabled: { type: 'boolean' },
      maxFeatures: { type: 'integer', minimum: 1, maximum: 100000 },
    },
  }
  if (labelConditionals.length > 0) {
    layerItemSchema['allOf'] = labelConditionals
  }

  return {
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
            items: layerItemSchema,
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
    resourceType: { type: 'string', default: 'regions' },
  },
}
}
