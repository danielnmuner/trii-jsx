import type { DailyClosingRecord } from '../api/schemas'
import { filterDailyClosingRecords, isHistoricMonitoringGapDate } from './analyticsDataPolicy'

function record(tradingDate: string): DailyClosingRecord {
  return {
    symbol: 'ECOPETROL',
    trading_date: tradingDate,
    source_captured_at: `${tradingDate}T14:55:00-05:00`,
  } as DailyClosingRecord
}

describe('historic monitoring gap', () => {
  it('flags only the dates inside the gap (inclusive)', () => {
    expect(isHistoricMonitoringGapDate('2026-11-06')).toBe(false)
    expect(isHistoricMonitoringGapDate('2026-11-09')).toBe(true)
    expect(isHistoricMonitoringGapDate('2026-11-20')).toBe(true)
    expect(isHistoricMonitoringGapDate('2026-11-23')).toBe(false)
  })

  it('drops daily closes inside the gap and keeps the surrounding days', () => {
    const kept = filterDailyClosingRecords(
      ['2026-11-06', '2026-11-09', '2026-11-13', '2026-11-20', '2026-11-23'].map(record),
    ).map((item) => item.trading_date)

    expect(kept).toEqual(['2026-11-06', '2026-11-23'])
  })
})
