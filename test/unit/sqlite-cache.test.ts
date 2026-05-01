import { describe, it, expect, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { SqliteCache } from '../../src/cache/sqlite.js'
import type { CachedLayer } from '../../src/cache/index.js'

const makeLayer = (overrides: Partial<CachedLayer> = {}): CachedLayer => ({
  providerId: 'traficom',
  typeName: 'rajoitusalue_a',
  featureCollection: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [25, 60] }, properties: { id: '1' } },
    ],
  },
  fetchedAt: new Date('2024-06-01T12:00:00Z'),
  bbox: [19, 59, 32, 70],
  etag: '"abc123"',
  lastModified: 'Sat, 01 Jun 2024 12:00:00 GMT',
  ...overrides,
})

let dbs: SqliteCache[] = []
let dirs: string[] = []

const tmpDir = () => {
  const d = path.join(os.tmpdir(), `wfs-sqlite-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  fs.mkdirSync(d, { recursive: true })
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const db of dbs) db.close()
  dbs = []
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true })
  dirs = []
})

function open(dir?: string): SqliteCache {
  const db = new SqliteCache(dir ?? tmpDir())
  dbs.push(db)
  return db
}

describe('SqliteCache', () => {
  it('round-trips a layer through save and loadAll', () => {
    const db = open()
    const layer = makeLayer()
    db.save(layer)

    const loaded = db.loadAll()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].providerId).toBe('traficom')
    expect(loaded[0].typeName).toBe('rajoitusalue_a')
    expect(loaded[0].fetchedAt).toEqual(new Date('2024-06-01T12:00:00Z'))
    expect(loaded[0].bbox).toEqual([19, 59, 32, 70])
    expect(loaded[0].etag).toBe('"abc123"')
    expect(loaded[0].lastModified).toBe('Sat, 01 Jun 2024 12:00:00 GMT')
    expect(loaded[0].featureCollection.features).toHaveLength(1)
  })

  it('overwrites existing row on second save (INSERT OR REPLACE)', () => {
    const db = open()
    db.save(makeLayer({ fetchedAt: new Date('2024-01-01') }))
    db.save(makeLayer({ fetchedAt: new Date('2024-06-01T12:00:00Z') }))

    const loaded = db.loadAll()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].fetchedAt).toEqual(new Date('2024-06-01T12:00:00Z'))
  })

  it('stores multiple layers independently', () => {
    const db = open()
    db.save(makeLayer({ typeName: 'layer_a' }))
    db.save(makeLayer({ typeName: 'layer_b' }))
    db.save(makeLayer({ providerId: 'other', typeName: 'layer_a' }))

    expect(db.loadAll()).toHaveLength(3)
  })

  it('handles missing etag and lastModified as undefined', () => {
    const db = open()
    db.save(makeLayer({ etag: undefined, lastModified: undefined }))

    const loaded = db.loadAll()
    expect(loaded[0].etag).toBeUndefined()
    expect(loaded[0].lastModified).toBeUndefined()
  })

  it('loadAll returns empty array when table is empty', () => {
    const db = open()
    expect(db.loadAll()).toHaveLength(0)
  })

  it('persists data across close and reopen', () => {
    const dir = tmpDir()
    const db1 = open(dir)
    db1.save(makeLayer())
    db1.close()
    dbs = dbs.filter((d) => d !== db1)

    const db2 = open(dir)
    expect(db2.loadAll()).toHaveLength(1)
  })

  it('loadAll skips rows with corrupt JSON and returns valid ones', () => {
    const dir = tmpDir()

    // Write one valid and one corrupt row directly via raw SQL
    const rawDb = new DatabaseSync(`${dir}/wfs-cache.db`)
    rawDb.exec(`
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
    const good = makeLayer({ typeName: 'good' })
    rawDb.prepare('INSERT INTO layers VALUES (?,?,?,?,?,?,?)').run(
      good.providerId, good.typeName, good.fetchedAt.toISOString(),
      JSON.stringify(good.bbox), null, null, JSON.stringify(good.featureCollection),
    )
    rawDb.prepare('INSERT INTO layers VALUES (?,?,?,?,?,?,?)').run(
      'p', 'bad', new Date().toISOString(), '{CORRUPT', null, null, '{CORRUPT',
    )
    rawDb.close()

    const db = open(dir)
    const loaded = db.loadAll()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].typeName).toBe('good')
  })
})
