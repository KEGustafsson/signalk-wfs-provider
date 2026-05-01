import { XMLParser } from 'fast-xml-parser'
import { parseCapabilities } from './capabilities.js'
import type { Capabilities, GetFeatureOptions, GetFeatureResult } from './types.js'
import { WfsServerError } from './types.js'
import type { ProviderConfig } from '../schema/config.js'

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

export class WfsClient {
  constructor(private readonly cfg: ProviderConfig) {}

  async getCapabilities(): Promise<Capabilities> {
    const url = new URL(this.cfg.url)
    url.searchParams.set('service', 'WFS')
    url.searchParams.set('version', this.cfg.version ?? '2.0.0')
    url.searchParams.set('request', 'GetCapabilities')

    const res = await fetch(url.toString(), {
      headers: { ...this.cfg.headers },
    })

    if (!res.ok) {
      throw new WfsServerError('HTTP_ERROR', `GetCapabilities failed: HTTP ${res.status}`)
    }

    const text = await res.text()
    return parseCapabilities(text)
  }

  buildGetFeatureUrl(opts: GetFeatureOptions): string {
    const url = new URL(this.cfg.url)
    url.searchParams.set('service', 'WFS')
    url.searchParams.set('version', this.cfg.version ?? '2.0.0')
    url.searchParams.set('request', 'GetFeature')
    url.searchParams.set('typeNames', opts.typeName)
    url.searchParams.set('outputFormat', 'application/json')

    if (opts.outputSrs) {
      url.searchParams.set('srsName', opts.outputSrs)
    }

    if (opts.bbox) {
      const [minLon, minLat, maxLon, maxLat] = opts.bbox
      const bboxSrs = opts.bboxSrs ?? opts.outputSrs ?? 'EPSG:4326'
      url.searchParams.set('bbox', `${minLon},${minLat},${maxLon},${maxLat},${bboxSrs}`)
    }

    if (opts.count !== undefined) {
      url.searchParams.set('count', String(opts.count))
    }

    if (opts.startIndex !== undefined) {
      url.searchParams.set('startIndex', String(opts.startIndex))
    }

    if (opts.filter) {
      url.searchParams.set('filter', opts.filter)
    }

    return url.toString()
  }

  async getFeature(opts: GetFeatureOptions): Promise<GetFeatureResult> {
    const url = this.buildGetFeatureUrl(opts)

    const reqHeaders: Record<string, string> = { ...this.cfg.headers }
    if (opts.ifNoneMatch) reqHeaders['If-None-Match'] = opts.ifNoneMatch
    if (opts.ifModifiedSince) reqHeaders['If-Modified-Since'] = opts.ifModifiedSince

    const res = await fetch(url, { headers: reqHeaders })

    if (res.status === 304) {
      return { notModified: true }
    }

    if (!res.ok) {
      const body = await res.text()
      this.maybeThrowXmlError(body, res.status)
      throw new WfsServerError('HTTP_ERROR', `GetFeature failed: HTTP ${res.status}`)
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('json')) {
      const body = await res.text()
      this.maybeThrowXmlError(body, res.status)
      throw new WfsServerError('UNEXPECTED_CONTENT_TYPE', `Expected JSON, got: ${contentType}`)
    }

    const featureCollection = (await res.json()) as GeoJSON.FeatureCollection
    const etag = res.headers.get('etag') ?? undefined
    const lastModified = res.headers.get('last-modified') ?? undefined

    return { notModified: false, featureCollection, etag, lastModified }
  }

  private maybeThrowXmlError(body: string, status: number): void {
    if (!body.includes('ExceptionReport') && !body.includes('ExceptionText')) return
    try {
      const doc = xmlParser.parse(body)
      const report =
        doc['ows:ExceptionReport'] ??
        doc['ExceptionReport']
      if (!report) return
      const exceptions = report['ows:Exception'] ?? report['Exception']
      const ex = Array.isArray(exceptions) ? exceptions[0] : exceptions
      const code = String(ex?.['@_exceptionCode'] ?? 'UNKNOWN')
      const text = String(
        ex?.['ows:ExceptionText'] ?? ex?.['ExceptionText'] ?? `HTTP ${status}`,
      )
      throw new WfsServerError(code, text)
    } catch (e) {
      if (e instanceof WfsServerError) throw e
    }
  }
}
