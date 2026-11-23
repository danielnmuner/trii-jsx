import type { DailyClosingRecord } from '../api/schemas'
import { filterHistoricRecordsByRange } from './historicOpenAiPrompt'

const record = (tradingDate: string) => ({ symbol: 'ECOPETROL', trading_date: tradingDate }) as DailyClosingRecord

// Business days with a data gap between Nov 6 and Nov 23 2026 (nothing collected Nov 9–20).
const records = ['2026-10-30', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-23'].map(record)

describe('filterHistoricRecordsByRange', () => {
  it('counts days with data, not calendar days', () => {
    // A 7-calendar-day window from Nov 23 would only keep Nov 23; by available days it keeps the last 3.
    expect(filterHistoricRecordsByRange(records, 3).map((item) => item.trading_date)).toEqual([
      '2026-11-05',
      '2026-11-06',
      '2026-11-23',
    ])
  })

  it('keeps every record when the range is larger than the available days, in original order', () => {
    expect(filterHistoricRecordsByRange(records, 365).map((item) => item.trading_date)).toEqual(
      records.map((item) => item.trading_date),
    )
  })

  it('drops non-business days', () => {
    const withWeekend = [...records, record('2026-11-22')]
    expect(filterHistoricRecordsByRange(withWeekend, 365).map((item) => item.trading_date)).not.toContain('2026-11-22')
  })
})
