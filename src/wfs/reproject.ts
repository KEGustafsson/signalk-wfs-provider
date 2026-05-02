import proj4 from 'proj4'
import type { Bbox } from '../bbox/geometry.js'

// Proj4 definitions for common WFS server CRS not included in proj4's built-ins.
// ETRS-based UTM zones used across Europe and Nordic countries.
const EXTRA_DEFS: Record<string, string> = {
  'EPSG:3067':  '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', // Finland ETRS-TM35FIN
  'EPSG:25832': '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', // UTM 32N
  'EPSG:25833': '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', // UTM 33N
  'EPSG:25834': '+proj=utm +zone=34 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', // UTM 34N
  'EPSG:25835': '+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs', // UTM 35N
  'EPSG:4258':  '+proj=longlat +ellps=GRS80 +no_defs',                                        // ETRS89 ≈ WGS84
  'EPSG:32632': '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs',
  'EPSG:32633': '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs',
  'EPSG:32634': '+proj=utm +zone=34 +datum=WGS84 +units=m +no_defs',
  'EPSG:32635': '+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs',
}

// Normalize OGC URN/URL CRS references to plain EPSG:XXXX form.
export function normalizeSrs(srs: string): string {
  // urn:ogc:def:crs:EPSG::3067  or  urn:ogc:def:crs:EPSG:6.6:3067
  const urnMatch = srs.match(/urn:ogc:def:crs:EPSG:[^:]*:(\d+)/i)
  if (urnMatch) return `EPSG:${urnMatch[1]}`
  // http://www.opengis.net/def/crs/EPSG/0/3067  (WFS 2.0 HTTP URI format)
  const ogcHttpMatch = srs.match(/\/def\/crs\/EPSG\/[^/]*\/(\d+)/i)
  if (ogcHttpMatch) return `EPSG:${ogcHttpMatch[1]}`
  // http://www.opengis.net/gml/srs/epsg.xml#3067  (legacy GML format)
  const gmlMatch = srs.match(/epsg\.xml#(\d+)/i)
  if (gmlMatch) return `EPSG:${gmlMatch[1]}`
  return srs
}

export function isWgs84(srs: string): boolean {
  const n = normalizeSrs(srs).toUpperCase()
  return n === 'EPSG:4326' || n === 'CRS:84' || n === 'WGS84'
}

function ensureRegistered(srs: string): void {
  if (!proj4.defs(srs) && EXTRA_DEFS[srs]) {
    proj4.defs(srs, EXTRA_DEFS[srs])
  }
}

function requireKnown(srs: string): void {
  ensureRegistered(srs)
  if (!proj4.defs(srs)) {
    throw new Error(`Unknown CRS '${srs}'. Add its proj4 definition to EXTRA_DEFS in reproject.ts.`)
  }
}

// Reproject a WGS84 [minLon,minLat,maxLon,maxLat] bbox into targetSrs coordinates.
// Projects all four corners and takes the envelope — handles map projection curvature.
export function bboxToSrs(bbox: Bbox, targetSrs: string): Bbox {
  const to = normalizeSrs(targetSrs)
  if (isWgs84(to)) return bbox
  requireKnown(to)
  const [minLon, minLat, maxLon, maxLat] = bbox
  const corners = [
    [minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat],
  ].map(([lon, lat]) => proj4('WGS84', to, [lon, lat]))
  const xs = corners.map((c) => c[0])
  const ys = corners.map((c) => c[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// Reproject a GeoJSON FeatureCollection from fromSrs to WGS84 in-place (returns new object).
export function reprojectToWgs84(
  fc: GeoJSON.FeatureCollection,
  fromSrs: string,
): GeoJSON.FeatureCollection {
  const from = normalizeSrs(fromSrs)
  if (isWgs84(from)) return fc
  requireKnown(from)
  const convert = (xy: number[]): number[] => proj4(from, 'WGS84', xy)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { bbox: _projectedBbox, ...rest } = fc as GeoJSON.FeatureCollection & { bbox?: unknown }
  return {
    ...rest,
    features: fc.features.map((f) => ({
      ...f,
      geometry: f.geometry ? reprojectGeometry(f.geometry, convert) : f.geometry,
    })),
  }
}

function reprojectGeometry(
  geom: GeoJSON.Geometry,
  convert: (xy: number[]) => number[],
): GeoJSON.Geometry {
  switch (geom.type) {
    case 'Point':
      return { ...geom, coordinates: convert(geom.coordinates) as [number, number] }
    case 'MultiPoint':
    case 'LineString':
      return { ...geom, coordinates: geom.coordinates.map(convert) as [number, number][] }
    case 'MultiLineString':
    case 'Polygon':
      return {
        ...geom,
        coordinates: geom.coordinates.map((ring) => ring.map(convert)) as [number, number][][],
      }
    case 'MultiPolygon':
      return {
        ...geom,
        coordinates: geom.coordinates.map((poly) =>
          poly.map((ring) => ring.map(convert)),
        ) as [number, number][][][],
      }
    case 'GeometryCollection':
      return {
        ...geom,
        geometries: geom.geometries.map((g) => reprojectGeometry(g, convert)),
      }
  }
}
