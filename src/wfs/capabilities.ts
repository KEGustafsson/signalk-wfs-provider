import { XMLParser } from 'fast-xml-parser'
import type { Capabilities, CapabilityLayer } from './types.js'

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return []
  return Array.isArray(val) ? val : [val]
}

export function parseCapabilities(xml: string): Capabilities {
  const doc = parser.parse(xml)

  const root =
    doc['wfs:WFS_Capabilities'] ??
    doc['WFS_Capabilities'] ??
    doc['wfs20:WFS_Capabilities']
  if (!root) throw new Error('No WFS_Capabilities root element found')

  const version: string =
    root['@_version'] ?? root['wfs:@_version'] ?? ''
  if (!version.startsWith('2.0')) {
    throw new Error(`Unsupported WFS version: ${version}. Only 2.0.0 is supported.`)
  }

  const opsMeta =
    root['ows:OperationsMetadata'] ??
    root['OperationsMetadata']
  if (!opsMeta) throw new Error('Missing OperationsMetadata in capabilities')

  const operations = toArray(opsMeta['ows:Operation'] ?? opsMeta['Operation'])
  const getFeatureOp = operations.find(
    (op: Record<string, unknown>) => (op['@_name'] as string) === 'GetFeature',
  )

  let globalOutputFormats: string[] = []
  if (getFeatureOp) {
    const params = toArray(getFeatureOp['ows:Parameter'] ?? getFeatureOp['Parameter'])
    const ofParam = params.find(
      (p: Record<string, unknown>) => (p['@_name'] as string) === 'outputFormat',
    )
    if (ofParam) {
      const allowed = ofParam['ows:AllowedValues'] ?? ofParam['AllowedValues']
      if (allowed) {
        const values = toArray(allowed['ows:Value'] ?? allowed['Value'])
        globalOutputFormats = values.map(String)
      }
    }
  }

  const ftList =
    root['wfs:FeatureTypeList'] ??
    root['FeatureTypeList']
  if (!ftList) throw new Error('Missing FeatureTypeList in capabilities')

  const ftTypes = toArray(
    ftList['wfs:FeatureType'] ?? ftList['FeatureType'],
  )

  const layers: CapabilityLayer[] = ftTypes.map((ft: Record<string, unknown>) => {
    const name = String(ft['wfs:Name'] ?? ft['Name'] ?? '')
    const title = String(ft['wfs:Title'] ?? ft['Title'] ?? name)
    const defaultCRS = String(
      ft['wfs:DefaultCRS'] ?? ft['DefaultCRS'] ?? ft['wfs:DefaultSRS'] ?? ft['DefaultSRS'] ?? '',
    )

    const otherCRSRaw = ft['wfs:OtherCRS'] ?? ft['OtherCRS'] ?? ft['wfs:OtherSRS'] ?? ft['OtherSRS']
    const otherCRS = toArray(otherCRSRaw).map(String)

    let wgs84BoundingBox: [number, number, number, number] | undefined
    const bb = ft['ows:WGS84BoundingBox'] ?? ft['WGS84BoundingBox']
    if (bb) {
      const bbRec = bb as Record<string, unknown>
      const lower = String(bbRec['ows:LowerCorner'] ?? bbRec['LowerCorner'] ?? '').split(' ')
      const upper = String(bbRec['ows:UpperCorner'] ?? bbRec['UpperCorner'] ?? '').split(' ')
      if (lower.length === 2 && upper.length === 2) {
        wgs84BoundingBox = [
          parseFloat(lower[0]),
          parseFloat(lower[1]),
          parseFloat(upper[0]),
          parseFloat(upper[1]),
        ]
      }
    }

    const outputFormatsRaw = ft['OutputFormats'] ?? ft['wfs:OutputFormats']
    let outputFormats: string[] = globalOutputFormats
    if (outputFormatsRaw) {
      const ofRec = outputFormatsRaw as Record<string, unknown>
      const vals = toArray(ofRec['OutputFormat'] ?? ofRec['wfs:OutputFormat'])
      if (vals.length > 0) outputFormats = vals.map(String)
    }

    return { name, title, defaultCRS, otherCRS, wgs84BoundingBox, outputFormats }
  })

  return { version, layers }
}

export function supportsGeoJson(layer: CapabilityLayer): boolean {
  return layer.outputFormats.some(
    (f) =>
      f.toLowerCase().includes('json') ||
      f.toLowerCase().includes('geojson'),
  )
}
