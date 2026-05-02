import { describe, it, expect } from 'vitest'
import { WfsClient } from '../../src/wfs/client.js'
import type { ProviderConfig } from '../../src/schema/config.js'

const baseCfg: ProviderConfig = {
  id: 'test',
  url: 'https://example.com/wfs',
  layers: [],
  bboxStrategy: 'static',
}

describe('WfsClient.buildGetFeatureUrl', () => {
  it('builds basic URL', () => {
    const client = new WfsClient(baseCfg)
    const url = client.buildGetFeatureUrl({ typeName: 'test_layer' })
    expect(url).toContain('service=WFS')
    expect(url).toContain('version=2.0.0')
    expect(url).toContain('request=GetFeature')
    expect(url).toContain('typeNames=test_layer')
    expect(url).toContain('outputFormat=application%2Fjson')
  })

  it('includes bbox parameter', () => {
    const client = new WfsClient(baseCfg)
    const url = client.buildGetFeatureUrl({
      typeName: 'test_layer',
      bbox: [19.0, 59.0, 32.0, 70.0],
      bboxSrs: 'EPSG:4326',
    })
    expect(url).toContain('bbox=19')
    expect(url).toContain('EPSG%3A4326')
  })

  it('includes count parameter', () => {
    const client = new WfsClient(baseCfg)
    const url = client.buildGetFeatureUrl({ typeName: 'test_layer', count: 5000 })
    expect(url).toContain('count=5000')
  })

  it('includes srsName parameter', () => {
    const client = new WfsClient(baseCfg)
    const url = client.buildGetFeatureUrl({
      typeName: 'test_layer',
      outputSrs: 'EPSG:4326',
    })
    expect(url).toContain('srsName=EPSG%3A4326')
  })
})
