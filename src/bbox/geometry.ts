export type Bbox = [number, number, number, number]

const NM_PER_DEGREE_LAT = 60

export function nmToDegreesLat(nm: number): number {
  return nm / NM_PER_DEGREE_LAT
}

export function nmToDegreesLon(nm: number, latDeg: number): number {
  const cosLat = Math.cos((latDeg * Math.PI) / 180)
  return cosLat === 0 ? 0 : nm / (NM_PER_DEGREE_LAT * cosLat)
}

export function distanceNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 3440.065 // Earth radius in nautical miles
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return c * R
}

export function bboxFromCenter(
  lat: number,
  lon: number,
  radiusNm: number,
): Bbox {
  const dLat = nmToDegreesLat(radiusNm)
  const dLon = nmToDegreesLon(radiusNm, lat)
  return [
    Math.max(-180, lon - dLon),
    Math.max(-90, lat - dLat),
    Math.min(180, lon + dLon),
    Math.min(90, lat + dLat),
  ]
}

export function bboxContains(outer: Bbox, inner: Bbox): boolean {
  return (
    outer[0] <= inner[0] &&
    outer[1] <= inner[1] &&
    outer[2] >= inner[2] &&
    outer[3] >= inner[3]
  )
}

export function expandBbox(bbox: Bbox, factor: number): Bbox {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const dLon = (maxLon - minLon) * factor
  const dLat = (maxLat - minLat) * factor
  return [
    Math.max(-180, minLon - dLon),
    Math.max(-90, minLat - dLat),
    Math.min(180, maxLon + dLon),
    Math.min(90, maxLat + dLat),
  ]
}
