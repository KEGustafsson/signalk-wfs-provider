import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Plugin } from '../../src/plugin.js'
import type { PluginConfig } from '../../src/schema/config.js'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const tmpDir = path.join(os.tmpdir(), `wfs-test-${Date.now()}`)

const makeApp = () => ({
  debug: vi.fn(),
  error: vi.fn(),
  registerResourceProvider: vi.fn(),
  setPluginStatus: vi.fn(),
  setPluginError: vi.fn(),
  handleMessage: vi.fn(),
  getDataDirPath: () => tmpDir,
})

const minimalConfig: PluginConfig = {
  providers: [
    {
      id: 'test',
      url: 'https://example.com/wfs',
      layers: [],
      bboxStrategy: 'static',
    },
  ],
  cacheDir: tmpDir,
}

describe('Plugin', () => {
  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  it('registers resource provider on start', async () => {
    const app = makeApp()

    // Mock fetch for capabilities
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
      headers: { get: () => null },
    } as unknown as Response)

    const plugin = new Plugin(app as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')
    await plugin.start(minimalConfig)

    expect(app.registerResourceProvider).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'wfs-features' }),
    )

    plugin.stop()
  })

  it('stops cleanly', async () => {
    const app = makeApp()
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
      headers: { get: () => null },
    } as unknown as Response)

    const plugin = new Plugin(app as Parameters<typeof Plugin>[0], 'signalk-wfs-provider')
    await plugin.start(minimalConfig)
    expect(() => plugin.stop()).not.toThrow()
  })
})
