import path from 'node:path'
import os from 'node:os'
import { Plugin } from './plugin.js'
import type { PluginConfig } from './schema/config.js'
import { buildConfigSchema } from './schema/config.js'
import { loadAllLayers, capabilitiesStorePath } from './schema/capabilities-store.js'

interface SignalKServerApp {
  debug: (msg: string) => void
  error: (msg: string) => void
  registerResourceProvider: (opts: unknown) => void
  streambundle?: unknown
  setPluginStatus?: (msg: string) => void
  setPluginError?: (msg: string) => void
  handleMessage?: (id: string, delta: unknown) => void
  getDataDirPath?: () => string
}

module.exports = function (app: SignalKServerApp) {
  let plugin: Plugin | null = null

  return {
    id: 'signalk-wfs-provider',
    name: 'WFS Provider',
    description:
      'Consumes OGC WFS endpoints and exposes features via Signal K v2 Resources API',

    schema() {
      const dataDir = app.getDataDirPath?.() ?? path.join(os.homedir(), '.signalk')
      const storeFile = capabilitiesStorePath(dataDir)
      const knownLayers = loadAllLayers(storeFile)
      return buildConfigSchema(knownLayers)
    },

    start(config: PluginConfig) {
      if (plugin) {
        plugin.stop()
        plugin = null
      }
      plugin = new Plugin(app as ConstructorParameters<typeof Plugin>[0], 'signalk-wfs-provider')
      plugin.start(config).catch((err: unknown) => {
        app.error(`Plugin start failed: ${String(err)}`)
        app.setPluginError?.(`Start failed: ${String(err)}`)
        plugin?.stop()
        plugin = null
      })
    },

    stop() {
      plugin?.stop()
      plugin = null
    },
  }
}
