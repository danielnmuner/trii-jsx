import { computeCumulativeVwap, computeStatZScore, formatMetricValue, formatPercentFromWhole } from './formatters'

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

  it('formats traded value in millions', () => {
    expect(formatMetricValue('traded_value', 21431910)).toBe('21.4 M')
  })

  it('formats traded volume in millions', () => {
    expect(formatMetricValue('traded_volume', 8346988)).toBe('8.35 M')
  })

  it('formats value rate in millions', () => {
    expect(formatMetricValue('value_rate', 1148533480)).toBe('1,148.53 M')
  })

  it('keeps traded volume as raw integer when below one million', () => {
    expect(formatMetricValue('traded_volume', 4417)).toBe('4,417')
  })

  it('keeps value rate as raw number when below one million', () => {
    expect(formatMetricValue('value_rate', 4852.14)).toBe('4,852.14')
  })
})
