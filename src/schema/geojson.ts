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
          geometry: { type: 'object' },
          properties: {},
        },
      },
    },
  },
}
