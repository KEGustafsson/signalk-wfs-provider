import { XMLParser } from 'fast-xml-parser'
import type { Capabilities, CapabilityLayer } from './types.js'

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return []
  return Array.isArray(val) ? val : [val]
}

function localName(key: string): string {
  const idx = key.indexOf(':')
  return idx === -1 ? key : key.slice(idx + 1)
}

function findByLocal(obj: Record<string, unknown>, local: string): unknown {
  for (const key of Object.keys(obj)) {
    if (localName(key) === local) return obj[key]
  }
  return undefined
}

export function parseCapabilities(xml: string): Capabilities {
  const doc = parser.parse(xml) as Record<string, unknown>

  const root = findByLocal(doc, 'WFS_Capabilities') as Record<string, unknown> | undefined
  if (!root) throw new Error('No WFS_Capabilities root element found')

  const versionKey = Object.keys(root).find((k) => k.endsWith('version') || k === '@_version')
  const version: string = versionKey ? String(root[versionKey]) : ''
  if (!version.startsWith('2.0')) {
    throw new Error(`Unsupported WFS version: ${version}. Only 2.0.0 is supported.`)
  }

  const opsMeta = findByLocal(root, 'OperationsMetadata') as Record<string, unknown> | undefined
  if (!opsMeta) throw new Error('Missing OperationsMetadata in capabilities')

  const operationsRaw = findByLocal(opsMeta, 'Operation')
  const operations = toArray(operationsRaw as Record<string, unknown> | Record<string, unknown>[] | undefined)
  const getFeatureOp = operations.find(
    (op: Record<string, unknown>) => (op['@_name'] as string) === 'GetFeature',
  )

  let globalOutputFormats: string[] = []
  if (getFeatureOp) {
    const paramsRaw = findByLocal(getFeatureOp as Record<string, unknown>, 'Parameter')
    const params = toArray(paramsRaw as Record<string, unknown> | Record<string, unknown>[] | undefined)
    const ofParam = params.find(
      (p: Record<string, unknown>) => (p['@_name'] as string) === 'outputFormat',
    )
    if (ofParam) {
      const allowed = findByLocal(ofParam as Record<string, unknown>, 'AllowedValues') as Record<string, unknown> | undefined
      if (allowed) {
        const valuesRaw = findByLocal(allowed, 'Value')
        const values = toArray(valuesRaw as string | string[] | undefined)
        globalOutputFormats = values.map(String)
      }
    }
  }

  const ftListRaw = findByLocal(root, 'FeatureTypeList') as Record<string, unknown> | undefined
  if (!ftListRaw) throw new Error('Missing FeatureTypeList in capabilities')

  const ftTypesRaw = findByLocal(ftListRaw, 'FeatureType')
  const ftTypes = toArray(ftTypesRaw as Record<string, unknown> | Record<string, unknown>[] | undefined)

  const layers: CapabilityLayer[] = ftTypes.map((ft: Record<string, unknown>) => {
    const name = String(findByLocal(ft, 'Name') ?? '')
    const title = String(findByLocal(ft, 'Title') ?? name)
    const defaultCRS = String(findByLocal(ft, 'DefaultCRS') ?? findByLocal(ft, 'DefaultSRS') ?? '')

    const otherCRSRaw = findByLocal(ft, 'OtherCRS') ?? findByLocal(ft, 'OtherSRS')
    const otherCRS = toArray(otherCRSRaw as string | string[] | undefined).map(String)

    let wgs84BoundingBox: [number, number, number, number] | undefined
    const bb = findByLocal(ft, 'WGS84BoundingBox') as Record<string, unknown> | undefined
    if (bb) {
      const lower = String(findByLocal(bb, 'LowerCorner') ?? '').trim().split(/\s+/)
      const upper = String(findByLocal(bb, 'UpperCorner') ?? '').trim().split(/\s+/)
      if (lower.length === 2 && upper.length === 2) {
        const coords = [
          Number.parseFloat(lower[0]),
          Number.parseFloat(lower[1]),
          Number.parseFloat(upper[0]),
          Number.parseFloat(upper[1]),
        ]
        if (coords.every(Number.isFinite)) {
          wgs84BoundingBox = coords as [number, number, number, number]
        }
      }
    }

    const outputFormatsRaw = findByLocal(ft, 'OutputFormats') as Record<string, unknown> | undefined
    let outputFormats: string[] = globalOutputFormats
    if (outputFormatsRaw) {
      const valsRaw = findByLocal(outputFormatsRaw, 'OutputFormat')
      const vals = toArray(valsRaw as string | string[] | undefined)
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
