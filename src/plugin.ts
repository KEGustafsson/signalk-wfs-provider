import path from 'node:path'
import os from 'node:os'
import { WfsClient } from './wfs/client.js'
import { Cache } from './cache/index.js'
import { SqliteCache } from './cache/sqlite.js'
import { ResourceProvider } from './resources/provider.js'
import { BboxManager } from './bbox/manager.js'
import type { PluginConfig, ProviderConfig } from './schema/config.js'
import type { Bbox } from './bbox/geometry.js'

interface SignalKApp {
  debug: (msg: string) => void
  error: (msg: string) => void
  registerResourceProvider: (opts: {
    type: string
    methods: {
      listResources: (query: unknown) => Promise<unknown>
      getResource: (id: string, query: unknown) => Promise<unknown>
      setResource?: (id: string, value: unknown) => Promise<void>
      deleteResource?: (id: string) => Promise<void>
    }
  }) => void
  streambundle?: {
    getSelfBus: (path: string) => {
      onValue: (cb: (v: { value: unknown }) => void) => { unsubscribe: () => void }
    }
  }
  setPluginStatus?: (msg: string) => void
  setPluginError?: (msg: string) => void
  handleMessage?: (id: string, delta: unknown) => void
  getDataDirPath?: () => string
}

export class Plugin {
  private cache = new Cache()
  private sqliteCache: SqliteCache | null = null
  private resourceProvider: ResourceProvider | null = null
  private clients = new Map<string, WfsClient>()
  private bboxManagers = new Map<string, BboxManager>()
  private refreshTimers = new Map<string, ReturnType<typeof setInterval>>()
  private positionSubscription: { unsubscribe: () => void } | null = null
  private config: PluginConfig | null = null

  constructor(
    private readonly app: SignalKApp,
    private readonly pluginId: string,
  ) {}

  async start(config: PluginConfig): Promise<void> {
    this.config = config
    const resourceType = config.resourceType ?? 'wfs-features'

    const cacheDir = config.cacheDir
      ? config.cacheDir.replace('~', os.homedir())
      : path.join(
          this.app.getDataDirPath?.() ?? path.join(os.homedir(), '.signalk'),
          'wfs-cache',
        )

    this.sqliteCache = new SqliteCache(cacheDir)

    for (const layer of this.sqliteCache.loadAll()) {
      this.cache.set(layer)
    }

    this.resourceProvider = new ResourceProvider(this.cache, resourceType)

    this.app.registerResourceProvider({
      type: resourceType,
      methods: {
        listResources: async (_query) => this.resourceProvider!.listResources(),
        getResource: async (id, _query) => this.resourceProvider!.getResource(id),
        setResource: async () => this.resourceProvider!.setResource(),
        deleteResource: async () => this.resourceProvider!.deleteResource(),
      },
    })

    this.app.setPluginStatus?.('Starting — fetching WFS capabilities...')

    for (const provider of config.providers) {
      await this.initProvider(provider)
    }

    this.app.setPluginStatus?.(`Running — ${this.cache.size()} layer(s) cached`)
  }

  private async initProvider(provider: ProviderConfig): Promise<void> {
    const client = new WfsClient(provider)
    this.clients.set(provider.id, client)

    try {
      const capabilities = await client.getCapabilities()
      this.app.debug(`[${provider.id}] capabilities loaded: ${capabilities.layers.length} layers`)
    } catch (err) {
      this.app.error(`[${provider.id}] Failed to load capabilities: ${String(err)}`)
    }

    const enabledLayers = provider.layers.filter((l) => l.enabled)

    const fetchAll = async (bbox?: Bbox) => {
      for (const layerCfg of enabledLayers) {
        await this.fetchLayer(client, provider, layerCfg.typeName, layerCfg.maxFeatures, bbox)
      }
    }

    const initialBbox = provider.staticBbox ?? undefined
    await fetchAll(initialBbox ?? undefined)

    const intervalMs = (provider.refreshIntervalSec ?? 3600) * 1000
    const timer = setInterval(async () => {
      const bbox =
        provider.bboxStrategy === 'follow-vessel'
          ? this.bboxManagers.get(provider.id)?.getCurrentBbox() ?? provider.staticBbox ?? undefined
          : provider.staticBbox ?? undefined
      await fetchAll(bbox ?? undefined)
    }, intervalMs)
    this.refreshTimers.set(provider.id, timer)

    if (provider.bboxStrategy === 'follow-vessel') {
      const manager = new BboxManager(provider, (bbox) => fetchAll(bbox))
      this.bboxManagers.set(provider.id, manager)

      if (this.app.streambundle && !this.positionSubscription) {
        const sub = this.app.streambundle
          .getSelfBus('navigation.position')
          .onValue((v) => {
            const pos = v.value as { latitude: number; longitude: number }
            for (const mgr of this.bboxManagers.values()) {
              mgr.onPosition(pos)
            }
          })
        this.positionSubscription = sub
      }
    }
  }

  private async fetchLayer(
    client: WfsClient,
    provider: ProviderConfig,
    typeName: string,
    maxFeatures?: number,
    bbox?: Bbox,
  ): Promise<void> {
    const existing = this.cache.get(provider.id, typeName)

    try {
      const result = await client.getFeature({
        typeName,
        bbox: bbox ?? undefined,
        bboxSrs: provider.srs ?? 'EPSG:4326',
        outputSrs: provider.srs ?? 'EPSG:4326',
        count: maxFeatures,
        ifNoneMatch: existing?.etag,
        ifModifiedSince: existing?.lastModified,
      })

      if (result.notModified && existing) {
        this.cache.set({ ...existing, fetchedAt: new Date() })
        this.sqliteCache?.save({ ...existing, fetchedAt: new Date() })
        this.app.debug(`[${provider.id}:${typeName}] 304 Not Modified`)
        return
      }

      if (result.featureCollection) {
        const layer = {
          providerId: provider.id,
          typeName,
          featureCollection: result.featureCollection,
          fetchedAt: new Date(),
          bbox: bbox ?? ([-180, -90, 180, 90] as Bbox),
          etag: result.etag,
          lastModified: result.lastModified,
        }
        this.cache.set(layer)
        this.sqliteCache?.save(layer)
        this.app.debug(
          `[${provider.id}:${typeName}] fetched ${result.featureCollection.features.length} features`,
        )
      }
    } catch (err) {
      this.app.error(`[${provider.id}:${typeName}] fetch failed: ${String(err)}`)
      this.emitNotification(provider.id, `Fetch failed for ${typeName}: ${String(err)}`)
    }
  }

  private emitNotification(providerId: string, message: string): void {
    this.app.handleMessage?.(this.pluginId, {
      updates: [
        {
          values: [
            {
              path: `notifications.system.wfsProvider.${providerId}`,
              value: {
                message,
                state: 'alarm',
                method: [],
              },
            },
          ],
        },
      ],
    })
  }

  stop(): void {
    for (const timer of this.refreshTimers.values()) clearInterval(timer)
    this.refreshTimers.clear()
    for (const mgr of this.bboxManagers.values()) mgr.destroy()
    this.bboxManagers.clear()
    this.positionSubscription?.unsubscribe()
    this.positionSubscription = null
    this.sqliteCache?.close()
    this.sqliteCache = null
    this.app.setPluginStatus?.('Stopped')
  }
}
