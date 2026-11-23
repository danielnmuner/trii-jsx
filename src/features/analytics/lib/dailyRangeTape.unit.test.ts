import type { DailyClosingRecord, SnapshotRecord } from '../api/schemas'
import {
  DAILY_RANGE_MIN_DAYS,
  DAILY_RANGE_WINDOW_DAYS,
  computeDailyRangeStats,
  computeTodayRange,
  resolveRangeSection,
  resolveTapePosition,
} from './dailyRangeTape'

function day(index: number, range: number, overrides: Partial<DailyClosingRecord> = {}): DailyClosingRecord {
  const date = new Date(Date.UTC(2026, 7, 3) + index * 86_400_000).toISOString().slice(0, 10)
  return {
    symbol: 'ECOPETROL',
    trading_date: date,
    high_price: 2500 + range,
    low_price: 2500,
    ...overrides,
  } as DailyClosingRecord
}

// 20 days alternating 40 / 80 → mean 60, sample σ = sqrt(20·400/19) = 20.5196…
const alternating = Array.from({ length: 20 }, (_, index) => day(index, index % 2 === 0 ? 40 : 80))

describe('computeDailyRangeStats', () => {
  it('computes mean and sample standard deviation of high − low in COP', () => {
    const result = computeDailyRangeStats(alternating, '2026-12-31')
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') return

    expect(result.stats.sampleSize).toBe(20)
    expect(result.stats.mean).toBeCloseTo(60, 10)
    expect(result.stats.stdDev).toBeCloseTo(Math.sqrt((20 * 400) / 19), 10)
    expect(result.stats.median).toBe(60)
    expect(result.stats.scaleMax).toBeCloseTo(60 + 3 * result.stats.stdDev, 10)
    expect(result.stats.ticks.map((tick) => tick.label)).toEqual(['−1σ', 'med', '+1σ', '+2σ', '+3σ'])
  })

  it('anchors the sections on the median, not the mean, for skewed ranges', () => {
    // 19 calm days of 50 and one 500 day: mean 72.5, median 50.
    const skewed = Array.from({ length: 20 }, (_, index) => day(index, index === 0 ? 500 : 50))
    const result = computeDailyRangeStats(skewed, '2026-12-31')
    if (result.status !== 'ready') throw new Error('expected ready')

    expect(result.stats.mean).toBeCloseTo(72.5, 10)
    expect(result.stats.median).toBe(50)
    expect(result.stats.ticks.find((tick) => tick.label === 'med')?.value).toBe(50)
    expect(result.stats.ticks.find((tick) => tick.label === '+1σ')?.value).toBeCloseTo(50 + result.stats.stdDev, 10)
    // The 500 day is past +3σ, so the tape extends to it.
    expect(result.stats.scaleMax).toBe(500)
  })

  it('counts every historic day in exactly one section', () => {
    const result = computeDailyRangeStats(alternating, '2026-12-31')
    if (result.status !== 'ready') throw new Error('expected ready')

    const counted = result.stats.sections.reduce((sum, section) => sum + section.dayCount, 0)
    expect(counted).toBe(20)
    expect(result.stats.sections.find((section) => section.key === 'below1')?.dayCount).toBe(10)
    expect(result.stats.sections.find((section) => section.key === 'above1')?.dayCount).toBe(10)
  })

  it('ignores today and later, missing prices, inverted prices and monitoring gaps', () => {
    const noisy = [
      ...alternating,
      day(0, 999, { trading_date: '2026-11-23' }),
      day(0, 999, { trading_date: '2026-11-12' }),
      day(0, 0, { trading_date: '2026-10-01', high_price: null }),
      day(0, 0, { trading_date: '2026-10-02', high_price: 2400, low_price: 2500 }),
    ]

    const result = computeDailyRangeStats(noisy, '2026-11-23')
    if (result.status !== 'ready') throw new Error('expected ready')
    expect(result.stats.sampleSize).toBe(20)
    expect(result.stats.mean).toBeCloseTo(60, 10)
  })

  it('uses only the most recent window of days', () => {
    const old = Array.from({ length: 30 }, (_, index) => day(index, 500))
    // Recent days start in 2027 so none fall inside the Nov 2026 monitoring gap.
    const recent = Array.from({ length: DAILY_RANGE_WINDOW_DAYS }, (_, index) => day(160 + index, 50))

    const result = computeDailyRangeStats([...old, ...recent], '2027-12-31')
    if (result.status !== 'ready') throw new Error('expected ready')
    expect(result.stats.sampleSize).toBe(DAILY_RANGE_WINDOW_DAYS)
    expect(result.stats.mean).toBe(50)
  })

  it('refuses to build a distribution with too few days', () => {
    const result = computeDailyRangeStats(alternating.slice(0, DAILY_RANGE_MIN_DAYS - 1), '2026-12-31')
    expect(result).toEqual({ status: 'insufficient', sampleSize: DAILY_RANGE_MIN_DAYS - 1 })
  })
})

describe('computeTodayRange', () => {
  const snapshot = (fields: Partial<SnapshotRecord>) =>
    ({ symbol: 'ECOPETROL', captured_at: '2026-11-23T11:00:00-05:00', ...fields }) as SnapshotRecord

  it('measures range, distance to the extremes and direction vs previous close', () => {
    expect(computeTodayRange(snapshot({ high_price: 2400, low_price: 2340, last_price: 2350, previous_close: 2315 }))).toEqual({
      range: 60,
      offHigh: 50,
      offLow: 10,
      change: 35,
    })
  })

  it('widens the range when the last trade is outside the reported high/low', () => {
    expect(computeTodayRange(snapshot({ high_price: 2400, low_price: 2340, last_price: 2330, previous_close: null }))).toEqual({
      range: 70,
      offHigh: 70,
      offLow: 0,
      change: null,
    })
  })

  it('returns null when prices are missing', () => {
    expect(computeTodayRange(snapshot({ high_price: null, low_price: 2340, last_price: 2350 }))).toBeNull()
    expect(computeTodayRange(snapshot({ high_price: 2400, low_price: 2340, last_price: null }))).toBeNull()
  })
})

describe('tape helpers', () => {
  it('positions and classifies a range on the tape', () => {
    const result = computeDailyRangeStats(alternating, '2026-12-31')
    if (result.status !== 'ready') throw new Error('expected ready')
    const { stats } = result

    expect(resolveTapePosition(stats.median, stats).ratio).toBeCloseTo(stats.median / stats.scaleMax, 10)
    expect(resolveTapePosition(stats.scaleMax * 2, stats)).toEqual({ ratio: 1, overflow: true })
    expect(resolveRangeSection(stats.median - 1, stats).key).toBe('below1')
    expect(resolveRangeSection(stats.median, stats).key).toBe('above1')
    expect(resolveRangeSection(stats.scaleMax * 2, stats).key).toBe('above3')
  })
})
