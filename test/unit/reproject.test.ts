import { describe, it, expect } from 'vitest'
import { normalizeSrs, isWgs84, bboxToSrs, reprojectToWgs84 } from '../../src/wfs/reproject.js'

describe('normalizeSrs', () => {
  it('passes through plain EPSG codes unchanged', () => {
    expect(normalizeSrs('EPSG:4326')).toBe('EPSG:4326')
    expect(normalizeSrs('EPSG:3067')).toBe('EPSG:3067')
  })

  it('normalizes OGC URN format', () => {
    expect(normalizeSrs('urn:ogc:def:crs:EPSG::3067')).toBe('EPSG:3067')
    expect(normalizeSrs('urn:ogc:def:crs:EPSG:6.6:4326')).toBe('EPSG:4326')
  })

  it('normalizes OGC HTTP URL format (legacy GML)', () => {
    expect(normalizeSrs('http://www.opengis.net/gml/srs/epsg.xml#3067')).toBe('EPSG:3067')
  })

  it('normalizes WFS 2.0 HTTP URI format', () => {
    expect(normalizeSrs('http://www.opengis.net/def/crs/EPSG/0/3067')).toBe('EPSG:3067')
    expect(normalizeSrs('http://www.opengis.net/def/crs/EPSG/0/4326')).toBe('EPSG:4326')
  })
})

describe('isWgs84', () => {
  it('returns true for WGS84 variants', () => {
    expect(isWgs84('EPSG:4326')).toBe(true)
    expect(isWgs84('CRS:84')).toBe(true)
    expect(isWgs84('WGS84')).toBe(true)
    expect(isWgs84('urn:ogc:def:crs:EPSG::4326')).toBe(true)
  })

  it('returns false for projected CRS', () => {
    expect(isWgs84('EPSG:3067')).toBe(false)
    expect(isWgs84('EPSG:3857')).toBe(false)
    expect(isWgs84('EPSG:25833')).toBe(false)
  })
})

describe('bboxToSrs', () => {
  it('returns bbox unchanged for WGS84 target', () => {
    const bbox: [number, number, number, number] = [24.0, 60.0, 25.0, 61.0]
    expect(bboxToSrs(bbox, 'EPSG:4326')).toEqual(bbox)
  })

  it('reprojects WGS84 bbox to EPSG:3067 (Finnish projection)', () => {
    // Helsinki area bbox in WGS84
    const bbox: [number, number, number, number] = [24.5, 59.9, 25.5, 60.5]
    const projected = bboxToSrs(bbox, 'EPSG:3067')
    // EPSG:3067 coordinates for Finland are roughly 300000–700000 E, 6600000–7800000 N
    expect(projected[0]).toBeGreaterThan(300_000)
    expect(projected[1]).toBeGreaterThan(6_600_000)
    expect(projected[2]).toBeGreaterThan(projected[0])
    expect(projected[3]).toBeGreaterThan(projected[1])
  })

  it('throws for unknown CRS', () => {
    const bbox: [number, number, number, number] = [0, 0, 1, 1]
    expect(() => bboxToSrs(bbox, 'EPSG:9999')).toThrow('Unknown CRS')
  })
})

describe('reprojectToWgs84', () => {
  it('returns feature collection unchanged when already WGS84', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [25.0, 60.0] },
        properties: {},
      }],
    }
    expect(reprojectToWgs84(fc, 'EPSG:4326')).toBe(fc)
  })

  it('reprojects Point from EPSG:3067 to WGS84', () => {
    // EPSG:3067 coordinate roughly at Helsinki (385000, 6672000)
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [385_000, 6_672_000] },
        properties: {},
      }],
    }
    const result = reprojectToWgs84(fc, 'EPSG:3067')
    const coords = (result.features[0].geometry as GeoJSON.Point).coordinates
    // Should be roughly [24.x, 60.x]
    expect(coords[0]).toBeCloseTo(24.5, 0)
    expect(coords[1]).toBeCloseTo(60.1, 0)
  })

  it('reprojects Polygon coordinates from EPSG:3067 to WGS84', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[385_000, 6_672_000], [386_000, 6_672_000], [386_000, 6_673_000], [385_000, 6_672_000]]],
        },
        properties: {},
      }],
    }
    const result = reprojectToWgs84(fc, 'EPSG:3067')
    const poly = result.features[0].geometry as GeoJSON.Polygon
    // All coordinates should be in WGS84 range
    for (const [lon, lat] of poly.coordinates[0]) {
      expect(lon).toBeGreaterThan(20)
      expect(lon).toBeLessThan(30)
      expect(lat).toBeGreaterThan(59)
      expect(lat).toBeLessThan(65)
    }
  })

  it('strips top-level bbox from reprojected FeatureCollection', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      bbox: [385_000, 6_672_000, 386_000, 6_673_000] as [number, number, number, number],
      features: [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [385_000, 6_672_000] },
        properties: {},
      }],
    }
    const result = reprojectToWgs84(fc, 'EPSG:3067') as Record<string, unknown>
    expect(result.bbox).toBeUndefined()
  })

  it('passes through null geometry without error', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: null as unknown as GeoJSON.Geometry, properties: {} }],
    }
    expect(() => reprojectToWgs84(fc, 'EPSG:3067')).not.toThrow()
  })

  it('throws for unknown CRS', () => {
    const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
    expect(() => reprojectToWgs84(fc, 'EPSG:9999')).toThrow('Unknown CRS')
  })
})
