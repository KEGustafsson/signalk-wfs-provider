import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      // Exclude the SK plugin entry point (needs a live SK server to exercise)
      // and pure type/schema declaration files (no executable statements).
      exclude: [
        'src/index.ts',
        'src/wfs/types.ts',
        'src/resources/types.ts',
        'src/schema/config.ts',
        'src/schema/geojson.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 70,
      },
    },
  },
})
