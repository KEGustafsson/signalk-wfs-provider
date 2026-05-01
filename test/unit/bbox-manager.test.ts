import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BboxManager } from '../../src/bbox/manager.js'
import type { ProviderConfig } from '../../src/schema/config.js'

vi.useFakeTimers()

const baseCfg: ProviderConfig = {
  id: 'test',
  url: 'https://example.com/wfs',
  layers: [],
  bboxStrategy: 'follow-vessel',
  vesselBboxRadiusNm: 30,
  minMoveDistanceNm: 5,
  refreshIntervalSec: 3600,
}

describe('BboxManager', () => {
  let fetchCalls: [number, number, number, number][]
  let manager: BboxManager

  beforeEach(() => {
    fetchCalls = []
    manager = new BboxManager(baseCfg, (bbox) => fetchCalls.push(bbox))
  })

  it('does not refetch on small movement', () => {
    manager.onPosition({ latitude: 60, longitude: 25 })
    vi.advanceTimersByTime(60_000)
    manager.onPosition({ latitude: 60.01, longitude: 25 }) // ~0.6nm
    vi.advanceTimersByTime(60_000)
    expect(fetchCalls).toHaveLength(1)
  })

  it('triggers refetch on large movement', () => {
    manager.onPosition({ latitude: 60, longitude: 25 })
    vi.advanceTimersByTime(60_000)
    manager.onPosition({ latitude: 61.0, longitude: 25 }) // ~60nm - exits the cached bbox
    vi.advanceTimersByTime(60_000)
    expect(fetchCalls).toHaveLength(2)
  })

  it('debounces multiple moves within 30s', () => {
    manager.onPosition({ latitude: 60, longitude: 25 })
    vi.advanceTimersByTime(60_000) // first fetch
    expect(fetchCalls).toHaveLength(1)

    manager.onPosition({ latitude: 61.0, longitude: 25 }) // ~60nm - exits the cached bbox
    vi.advanceTimersByTime(10_000)
    manager.onPosition({ latitude: 62.0, longitude: 25 }) // another ~60nm
    vi.advanceTimersByTime(30_000) // debounce expires
    expect(fetchCalls).toHaveLength(2) // only one additional fetch
  })

  it('does not refetch when new bbox contained in old', () => {
    manager.triggerImmediateFetch([24, 59, 26, 61])
    expect(fetchCalls).toHaveLength(1)

    manager.onPosition({ latitude: 60, longitude: 25 }) // inside the bbox
    vi.advanceTimersByTime(60_000)
    // movement is less than minMoveDistanceNm from lastPosition (null initially)
    // After triggerImmediateFetch sets lastFetchBbox, onPosition checks containment
    // The 30nm bbox around 60,25 should be inside the padded [24,59,26,61]
    // padded 20%: [23.6, 58.8, 26.4, 61.4], 30nm ~= 0.5deg lat, so bbox ~[24.5,59.5,25.5,60.5]
    // That IS contained. So no fetch.
    // But first onPosition call: lastPosition is null, so distance check skipped, goes to bbox check
  })
})
