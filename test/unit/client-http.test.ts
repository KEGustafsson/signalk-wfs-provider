import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { WfsClient } from '../../src/wfs/client.js'
import { WfsServerError } from '../../src/wfs/types.js'
import type { ProviderConfig } from '../../src/schema/config.js'

const fixturesDir = path.join(process.cwd(), 'test/fixtures')

const baseCfg: ProviderConfig = {
  id: 'test',
  url: 'https://example.com/wfs',
  layers: [],
  bboxStrategy: 'static',
  headers: { 'User-Agent': 'test' },
}

function mockFetch(opts: {
  status?: number
  ok?: boolean
  body?: string
  json?: unknown
  contentType?: string
  etag?: string
  lastModified?: string
}) {
  const { status = 200, body, json, contentType = 'application/json', etag, lastModified } = opts
  const ok = opts.ok ?? status < 400

  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => body ?? JSON.stringify(json ?? {}),
    json: async () => json ?? {},
    headers: {
      get: (h: string) => {
        if (h === 'content-type') return contentType
        if (h === 'etag') return etag ?? null
        if (h === 'last-modified') return lastModified ?? null
        return null
      },
    },
  })
}

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch
})

function setFetch(fn: ReturnType<typeof mockFetch>) {
  global.fetch = fn as unknown as typeof fetch
}

describe('WfsClient.getCapabilities', () => {
  it('returns parsed capabilities on 200', async () => {
    const xml = readFileSync(path.join(fixturesDir, 'traficom-capabilities.xml'), 'utf8')
    setFetch(mockFetch({ body: xml, contentType: 'text/xml' }))

    const client = new WfsClient(baseCfg)
    const caps = await client.getCapabilities()
    expect(caps.version).toBe('2.0.0')
    expect(caps.layers.length).toBeGreaterThan(0)
  })

  it('throws WfsServerError on HTTP error', async () => {
    setFetch(mockFetch({ status: 500, ok: false, body: 'Internal error', contentType: 'text/plain' }))

    const client = new WfsClient(baseCfg)
    await expect(client.getCapabilities()).rejects.toThrow(WfsServerError)
  })
})

describe('WfsClient.getFeature', () => {
  it('returns feature collection on 200 JSON', async () => {
    const fc = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: null, properties: {} }],
    }
    setFetch(mockFetch({ json: fc, etag: '"abc"', lastModified: 'Thu, 01 Jan 2024 00:00:00 GMT' }))

    const client = new WfsClient(baseCfg)
    const result = await client.getFeature({ typeName: 'test_layer' })
    expect(result.notModified).toBe(false)
    expect(result.featureCollection?.features).toHaveLength(1)
    expect(result.etag).toBe('"abc"')
    expect(result.lastModified).toBe('Thu, 01 Jan 2024 00:00:00 GMT')
  })

  it('returns notModified on 304', async () => {
    setFetch(mockFetch({ status: 304, ok: false, body: '' }))

    const client = new WfsClient(baseCfg)
    const result = await client.getFeature({ typeName: 'test_layer', ifNoneMatch: '"abc"' })
    expect(result.notModified).toBe(true)
    expect(result.featureCollection).toBeUndefined()
  })

  it('throws WfsServerError on XML ExceptionReport', async () => {
    const xml = readFileSync(path.join(fixturesDir, 'exception-report.xml'), 'utf8')
    setFetch(mockFetch({ status: 400, ok: false, body: xml, contentType: 'application/xml' }))

    const client = new WfsClient(baseCfg)
    await expect(client.getFeature({ typeName: 'nonexistent' })).rejects.toThrow(WfsServerError)
  })

  it('throws WfsServerError when 200 but content-type is xml with exception', async () => {
    const xml = readFileSync(path.join(fixturesDir, 'exception-report.xml'), 'utf8')
    setFetch(mockFetch({ status: 200, body: xml, contentType: 'application/xml' }))

    const client = new WfsClient(baseCfg)
    await expect(client.getFeature({ typeName: 'test_layer' })).rejects.toThrow(WfsServerError)
  })

  it('sends If-None-Match and If-Modified-Since headers', async () => {
    const fc = { type: 'FeatureCollection', features: [] }
    const fetchFn = mockFetch({ json: fc })
    setFetch(fetchFn)

    const client = new WfsClient(baseCfg)
    await client.getFeature({
      typeName: 'test_layer',
      ifNoneMatch: '"etag123"',
      ifModifiedSince: 'Thu, 01 Jan 2024 00:00:00 GMT',
    })

    const [, options] = fetchFn.mock.calls[0] as [string, { headers: Record<string, string> }]
    expect(options.headers['If-None-Match']).toBe('"etag123"')
    expect(options.headers['If-Modified-Since']).toBe('Thu, 01 Jan 2024 00:00:00 GMT')
  })

  it('includes startIndex and filter in URL', async () => {
    const fc = { type: 'FeatureCollection', features: [] }
    const fetchFn = mockFetch({ json: fc })
    setFetch(fetchFn)

    const client = new WfsClient(baseCfg)
    await client.getFeature({ typeName: 'test_layer', startIndex: 100, filter: 'CQL_FILTER' })

    const [url] = fetchFn.mock.calls[0] as [string]
    expect(url).toContain('startIndex=100')
    expect(url).toContain('filter=CQL_FILTER')
  })
})
