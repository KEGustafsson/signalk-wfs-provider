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

  it('uses per-layer OutputFormats when present', () => {
    const xml = `<?xml version="1.0"?>
      <wfs:WFS_Capabilities version="2.0.0"
        xmlns:wfs="http://www.opengis.net/wfs/2.0"
        xmlns:ows="http://www.opengis.net/ows/1.1">
        <ows:OperationsMetadata>
          <ows:Operation name="GetFeature">
            <ows:Parameter name="outputFormat">
              <ows:AllowedValues><ows:Value>text/xml</ows:Value></ows:AllowedValues>
            </ows:Parameter>
          </ows:Operation>
        </ows:OperationsMetadata>
        <wfs:FeatureTypeList>
          <wfs:FeatureType>
            <wfs:Name>layer_a</wfs:Name>
            <wfs:Title>Layer A</wfs:Title>
            <wfs:DefaultCRS>urn:ogc:def:crs:EPSG::4326</wfs:DefaultCRS>
            <OutputFormats>
              <OutputFormat>application/json</OutputFormat>
            </OutputFormats>
          </wfs:FeatureType>
        </wfs:FeatureTypeList>
      </wfs:WFS_Capabilities>`
    const caps = parseCapabilities(xml)
    // Per-layer formats override the global ones
    expect(caps.layers[0].outputFormats).toContain('application/json')
  })

  it('parses layer with no OtherCRS and no wgs84BoundingBox', () => {
    const xml = `<?xml version="1.0"?>
      <wfs:WFS_Capabilities version="2.0.0"
        xmlns:wfs="http://www.opengis.net/wfs/2.0"
        xmlns:ows="http://www.opengis.net/ows/1.1">
        <ows:OperationsMetadata>
          <ows:Operation name="GetCapabilities"/>
        </ows:OperationsMetadata>
        <wfs:FeatureTypeList>
          <wfs:FeatureType>
            <wfs:Name>layer_a</wfs:Name>
            <wfs:Title>Layer A</wfs:Title>
            <wfs:DefaultCRS>urn:ogc:def:crs:EPSG::4326</wfs:DefaultCRS>
          </wfs:FeatureType>
        </wfs:FeatureTypeList>
      </wfs:WFS_Capabilities>`
    const caps = parseCapabilities(xml)
    expect(caps.layers[0].name).toBe('layer_a')
    expect(caps.layers[0].otherCRS).toEqual([])
    expect(caps.layers[0].wgs84BoundingBox).toBeUndefined()
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

  it('parses non-namespaced WFS_Capabilities root element', () => {
    const xml = `<?xml version="1.0"?>
      <WFS_Capabilities version="2.0.0">
        <OperationsMetadata>
          <Operation name="GetCapabilities"/>
        </OperationsMetadata>
        <FeatureTypeList>
          <FeatureType>
            <Name>layer_b</Name>
            <Title>Layer B</Title>
            <DefaultCRS>urn:ogc:def:crs:EPSG::4326</DefaultCRS>
          </FeatureType>
        </FeatureTypeList>
      </WFS_Capabilities>`
    const caps = parseCapabilities(xml)
    expect(caps.version).toBe('2.0.0')
    expect(caps.layers[0].name).toBe('layer_b')
  })

  it('uses empty outputFormats when GetFeature op is absent', () => {
    const xml = `<?xml version="1.0"?>
      <wfs:WFS_Capabilities version="2.0.0"
        xmlns:wfs="http://www.opengis.net/wfs/2.0"
        xmlns:ows="http://www.opengis.net/ows/1.1">
        <ows:OperationsMetadata>
          <ows:Operation name="GetCapabilities"/>
        </ows:OperationsMetadata>
        <wfs:FeatureTypeList>
          <wfs:FeatureType>
            <wfs:Name>layer_c</wfs:Name>
            <wfs:Title>Layer C</wfs:Title>
            <wfs:DefaultCRS>urn:ogc:def:crs:EPSG::4326</wfs:DefaultCRS>
          </wfs:FeatureType>
        </wfs:FeatureTypeList>
      </wfs:WFS_Capabilities>`
    const caps = parseCapabilities(xml)
    expect(caps.layers[0].outputFormats).toEqual([])
  })

  it('ignores malformed wgs84BoundingBox with wrong corner format', () => {
    const xml = `<?xml version="1.0"?>
      <wfs:WFS_Capabilities version="2.0.0"
        xmlns:wfs="http://www.opengis.net/wfs/2.0"
        xmlns:ows="http://www.opengis.net/ows/1.1">
        <ows:OperationsMetadata>
          <ows:Operation name="GetCapabilities"/>
        </ows:OperationsMetadata>
        <wfs:FeatureTypeList>
          <wfs:FeatureType>
            <wfs:Name>layer_d</wfs:Name>
            <wfs:DefaultCRS>urn:ogc:def:crs:EPSG::4326</wfs:DefaultCRS>
            <ows:WGS84BoundingBox>
              <ows:LowerCorner>only-one-value</ows:LowerCorner>
              <ows:UpperCorner>also-one-value</ows:UpperCorner>
            </ows:WGS84BoundingBox>
          </wfs:FeatureType>
        </wfs:FeatureTypeList>
      </wfs:WFS_Capabilities>`
    const caps = parseCapabilities(xml)
    expect(caps.layers[0].wgs84BoundingBox).toBeUndefined()
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
