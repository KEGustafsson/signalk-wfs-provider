import { distanceNm, bboxFromCenter, bboxContains, expandBbox } from './geometry.js'
import type { Bbox } from './geometry.js'
import type { ProviderConfig } from '../schema/config.js'

export type FetchTrigger = (bbox: Bbox) => void

export class BboxManager {
  private lastPosition: { lat: number; lon: number } | null = null
  private lastFetchBbox: Bbox | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly cfg: ProviderConfig,
    private readonly onFetch: FetchTrigger,
  ) {}

  onPosition(pos: { latitude: number; longitude: number }): void {
    const { latitude: lat, longitude: lon } = pos

    if (this.lastPosition) {
      const dist = distanceNm(this.lastPosition.lat, this.lastPosition.lon, lat, lon)
      if (dist < (this.cfg.minMoveDistanceNm ?? 5)) return
    }

    this.lastPosition = { lat, lon }

    const newBbox = bboxFromCenter(lat, lon, this.cfg.vesselBboxRadiusNm ?? 30)

    if (this.lastFetchBbox) {
      const padded = expandBbox(this.lastFetchBbox, 0.2)
      if (bboxContains(padded, newBbox)) return
    }

    this.scheduleFetch(newBbox)
  }

  private scheduleFetch(bbox: Bbox): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.lastFetchBbox = bbox
      this.onFetch(bbox)
    }, 30_000)
  }

  triggerImmediateFetch(bbox: Bbox): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.lastFetchBbox = bbox
    this.onFetch(bbox)
  }

  getCurrentBbox(): Bbox | null {
    if (this.lastPosition) {
      return bboxFromCenter(
        this.lastPosition.lat,
        this.lastPosition.lon,
        this.cfg.vesselBboxRadiusNm ?? 30,
      )
    }
    return this.cfg.staticBbox ?? null
  }

  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
  }
}
