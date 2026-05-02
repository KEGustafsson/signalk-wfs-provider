import { describe, it, expect } from 'vitest'
import {
  distanceNm,
  bboxFromCenter,
  bboxContains,
  expandBbox,
} from '../../src/bbox/geometry.js'

describe('distanceNm', () => {
  it('returns 0 for same point', () => {
    expect(distanceNm(60, 25, 60, 25)).toBeCloseTo(0)
  })

  it('calculates north-south distance', () => {
    const d = distanceNm(60, 25, 61, 25)
    expect(d).toBeCloseTo(60, 0)
  })
})

describe('bboxFromCenter', () => {
  it('creates bbox around point', () => {
    const bbox = bboxFromCenter(60, 25, 30)
    expect(bbox[0]).toBeLessThan(25)
    expect(bbox[1]).toBeLessThan(60)
    expect(bbox[2]).toBeGreaterThan(25)
    expect(bbox[3]).toBeGreaterThan(60)
  })

  it('clamps to valid coordinates', () => {
    const bbox = bboxFromCenter(89, 179, 1000)
    expect(bbox[0]).toBeGreaterThanOrEqual(-180)
    expect(bbox[1]).toBeGreaterThanOrEqual(-90)
    expect(bbox[2]).toBeLessThanOrEqual(180)
    expect(bbox[3]).toBeLessThanOrEqual(90)
  })
})

describe('bboxContains', () => {
  it('returns true when outer contains inner', () => {
    const outer: [number, number, number, number] = [0, 0, 10, 10]
    const inner: [number, number, number, number] = [2, 2, 8, 8]
    expect(bboxContains(outer, inner)).toBe(true)
  })

  it('returns false when inner extends beyond outer', () => {
    const outer: [number, number, number, number] = [0, 0, 10, 10]
    const inner: [number, number, number, number] = [2, 2, 12, 8]
    expect(bboxContains(outer, inner)).toBe(false)
  })
})

describe('expandBbox', () => {
  it('expands bbox by factor', () => {
    const bbox: [number, number, number, number] = [10, 20, 20, 30]
    const expanded = expandBbox(bbox, 0.1)
    expect(expanded[0]).toBeLessThan(10)
    expect(expanded[1]).toBeLessThan(20)
    expect(expanded[2]).toBeGreaterThan(20)
    expect(expanded[3]).toBeGreaterThan(30)
  })
})
