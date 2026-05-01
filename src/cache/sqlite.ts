import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import fs from 'node:fs'
import type { CachedLayer } from './index.js'
import type { Bbox } from '../bbox/geometry.js'

export class SqliteCache {
  private db: DatabaseSync
  private closed = false

  constructor(cacheDir: string) {
    fs.mkdirSync(cacheDir, { recursive: true })
    const dbPath = path.join(cacheDir, 'wfs-cache.db')
    this.db = new DatabaseSync(dbPath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS layers (
        provider_id TEXT NOT NULL,
        type_name TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        bbox_json TEXT NOT NULL,
        etag TEXT,
        last_modified TEXT,
        geojson_blob TEXT NOT NULL,
        PRIMARY KEY (provider_id, type_name)
      )
    `)
  }

  save(layer: CachedLayer): void {
    if (this.closed) return
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO layers
        (provider_id, type_name, fetched_at, bbox_json, etag, last_modified, geojson_blob)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      layer.providerId,
      layer.typeName,
      layer.fetchedAt.toISOString(),
      JSON.stringify(layer.bbox),
      layer.etag ?? null,
      layer.lastModified ?? null,
      JSON.stringify(layer.featureCollection),
    )
  }

  loadAll(): CachedLayer[] {
    if (this.closed) return []
    const rows = this.db.prepare('SELECT * FROM layers').all() as Array<{
      provider_id: string
      type_name: string
      fetched_at: string
      bbox_json: string
      etag: string | null
      last_modified: string | null
      geojson_blob: string
    }>

    return rows.map((row) => ({
      providerId: row.provider_id,
      typeName: row.type_name,
      fetchedAt: new Date(row.fetched_at),
      bbox: JSON.parse(row.bbox_json) as Bbox,
      etag: row.etag ?? undefined,
      lastModified: row.last_modified ?? undefined,
      featureCollection: JSON.parse(row.geojson_blob) as GeoJSON.FeatureCollection,
    }))
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.db.close()
  }
}
