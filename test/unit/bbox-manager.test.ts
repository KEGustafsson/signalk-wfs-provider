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
    vi.clearAllTimers()
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
    // The 30nm bbox around 60,25 is inside the padded [24,59,26,61], so no extra fetch.
  })

  it('getCurrentBbox returns bbox from last position when set', () => {
    manager.onPosition({ latitude: 60, longitude: 25 })
    const bbox = manager.getCurrentBbox()
    expect(bbox).not.toBeNull()
    expect(bbox![0]).toBeLessThan(25)   // minLon
    expect(bbox![2]).toBeGreaterThan(25) // maxLon
  })

  it('getCurrentBbox returns staticBbox when no position received', () => {
    const cfg = { ...baseCfg, staticBbox: [20, 59, 30, 65] as [number, number, number, number] }
    const m = new BboxManager(cfg, () => {})
    expect(m.getCurrentBbox()).toEqual([20, 59, 30, 65])
  })

  it('getCurrentBbox returns null when no position and no staticBbox', () => {
    expect(manager.getCurrentBbox()).toBeNull()
  })

  it('destroy cancels pending debounce timer', () => {
    manager.onPosition({ latitude: 60, longitude: 25 })
    // timer pending — destroy before it fires
    manager.destroy()
    vi.advanceTimersByTime(60_000)
    expect(fetchCalls).toHaveLength(0)
  })

  it('triggerImmediateFetch cancels pending debounce and fires immediately', () => {
    manager.onPosition({ latitude: 60, longitude: 25 }) // schedules debounce
    manager.triggerImmediateFetch([19, 59, 32, 70])     // cancels it, fires now
    vi.advanceTimersByTime(60_000)
    expect(fetchCalls).toHaveLength(1) // only the immediate one
    expect(fetchCalls[0]).toEqual([19, 59, 32, 70])
  })
})
