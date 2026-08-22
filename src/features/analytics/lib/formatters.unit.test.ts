import { computeCumulativeVwap, computeStatZScore, formatPercentFromWhole } from './formatters'

describe('analytics formatters', () => {
  it('formats whole-number percentages as decimal percentages', () => {
    expect(formatPercentFromWhole(68).replace(/\s/g, '')).toBe('0.68%')
  })

  it('computes cumulative vwap from value and volume', () => {
    expect(
      computeCumulativeVwap({
        symbol: 'NUCO',
        captured_at: '2026-08-21T14:30:00-05:00',
        traded_value: 1000,
        traded_volume: 10,
      }),
    ).toBe(100)
  })

  it('computes z score only when there is enough sample support', () => {
    expect(
      computeStatZScore({
        latest_value: 14,
        mean: 10,
        stddev: 2,
        sample_count: 10,
      }),
    ).toBe(2)
  })
})
