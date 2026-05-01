export const featureCollectionSchema = {
  type: 'object',
  required: ['type', 'features'],
  properties: {
    type: { type: 'string', const: 'FeatureCollection' },
    features: {
      type: 'array',
      items: {
        type: 'object',
        required: ['type', 'geometry', 'properties'],
        properties: {
          type: { type: 'string', const: 'Feature' },
          geometry: { anyOf: [{ type: 'object' }, { type: 'null' }] },
          properties: { anyOf: [{ type: 'object' }, { type: 'null' }] },
        },
      },
    },
  },
}
