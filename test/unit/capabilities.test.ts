import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseCapabilities, supportsGeoJson } from '../../src/wfs/capabilities.js'

const fixturesDir = path.join(process.cwd(), 'test/fixtures')

describe('parseCapabilities', () => {
  it('parses Traficom capabilities fixture', () => {
    const xml = readFileSync(path.join(fixturesDir, 'traficom-capabilities.xml'), 'utf8')
    const caps = parseCapabilities(xml)
    expect(caps.version).toBe('2.0.0')
    expect(caps.layers).toHaveLength(2)
    expect(caps.layers[0].name).toBe('rajoitusalue_a')
    expect(caps.layers[0].title).toBe('Restricted areas')
    expect(caps.layers[0].outputFormats).toContain('application/json')
  })

  it('parses wgs84BoundingBox', () => {
    const xml = readFileSync(path.join(fixturesDir, 'traficom-capabilities.xml'), 'utf8')
    const caps = parseCapabilities(xml)
    const layer = caps.layers[0]
    expect(layer.wgs84BoundingBox).toBeDefined()
    expect(layer.wgs84BoundingBox![0]).toBeCloseTo(19.0)
    expect(layer.wgs84BoundingBox![1]).toBeCloseTo(59.0)
  })

  it('throws on unsupported WFS version', () => {
    const xml = `<?xml version="1.0"?>
      <wfs:WFS_Capabilities version="1.1.0"
        xmlns:wfs="http://www.opengis.net/wfs/2.0"
        xmlns:ows="http://www.opengis.net/ows/1.1">
        <ows:OperationsMetadata/>
        <wfs:FeatureTypeList/>
      </wfs:WFS_Capabilities>`
    expect(() => parseCapabilities(xml)).toThrow('Unsupported WFS version')
  })

  it('throws on missing OperationsMetadata', () => {
    const xml = `<?xml version="1.0"?>
      <wfs:WFS_Capabilities version="2.0.0"
        xmlns:wfs="http://www.opengis.net/wfs/2.0"
        xmlns:ows="http://www.opengis.net/ows/1.1">
        <wfs:FeatureTypeList/>
      </wfs:WFS_Capabilities>`
    expect(() => parseCapabilities(xml)).toThrow('Missing OperationsMetadata')
  })
})

describe('supportsGeoJson', () => {
  it('returns true for application/json format', () => {
    expect(
      supportsGeoJson({
        name: 'test',
        title: 'Test',
        defaultCRS: 'EPSG:4326',
        otherCRS: [],
        outputFormats: ['application/json'],
      }),
    ).toBe(true)
  })

  it('returns false for gml-only output', () => {
    expect(
      supportsGeoJson({
        name: 'test',
        title: 'Test',
        defaultCRS: 'EPSG:4326',
        otherCRS: [],
        outputFormats: ['text/xml; subtype=gml/3.2'],
      }),
    ).toBe(false)
  })
})
