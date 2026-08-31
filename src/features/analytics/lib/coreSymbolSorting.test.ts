import { describe, expect, it } from 'vitest'
import type { AnalyticsSymbolFeed } from '../api/schemas'
import { rankCoreSymbols } from './coreSymbolSorting'

function createSnapshot(overrides: Partial<AnalyticsSymbolFeed['current_snapshot']> = {}): AnalyticsSymbolFeed['current_snapshot'] {
  return {
    symbol: 'TEST',
    captured_at: '2026-08-25T10:00:00-05:00',
    ...overrides,
  }
}

function createFeed({
  snapshot = {},
}: {
  snapshot?: Partial<AnalyticsSymbolFeed['current_snapshot']>
} = {}): AnalyticsSymbolFeed {
  return {
    symbol: snapshot.symbol ?? 'TEST',
    record_count: 2,
    from_timestamp: '2026-08-25T09:50:00-05:00',
    to_timestamp: '2026-08-25T10:00:00-05:00',
    current_snapshot: createSnapshot(snapshot),
    previous_snapshot: createSnapshot({ symbol: snapshot.symbol ?? 'TEST', captured_at: '2026-08-25T09:50:00-05:00' }),
    snapshots: [createSnapshot(snapshot)],
    current_stats: {},
  }
}

describe('rankCoreSymbols', () => {
  it('sorts by last price premium vs vwap descending for up intent', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC', 'DDD'],
      latestBySymbol: {
        AAA: createFeed({ snapshot: { symbol: 'AAA', last_price: 105, traded_value: 1_000, traded_volume: 10 } }),
        BBB: createFeed({ snapshot: { symbol: 'BBB', last_price: 97, traded_value: 1_000, traded_volume: 10 } }),
        CCC: createFeed({ snapshot: { symbol: 'CCC', last_price: 112, traded_value: 1_000, traded_volume: 10 } }),
        DDD: createFeed({ snapshot: { symbol: 'DDD', last_price: 100, traded_value: 1_000, traded_volume: 10 } }),
      },
      intent: 'up',
    })

    expect(ordered).toEqual(['CCC', 'AAA', 'BBB', 'DDD'])
  })

  it('sorts by last price discount vs vwap ascending for down intent', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC', 'DDD'],
      latestBySymbol: {
        AAA: createFeed({ snapshot: { symbol: 'AAA', last_price: 105, traded_value: 1_000, traded_volume: 10 } }),
        BBB: createFeed({ snapshot: { symbol: 'BBB', last_price: 97, traded_value: 1_000, traded_volume: 10 } }),
        CCC: createFeed({ snapshot: { symbol: 'CCC', last_price: 92, traded_value: 1_000, traded_volume: 10 } }),
        DDD: createFeed({ snapshot: { symbol: 'DDD', last_price: 100, traded_value: 1_000, traded_volume: 10 } }),
      },
      intent: 'down',
    })

    expect(ordered).toEqual(['CCC', 'BBB', 'AAA', 'DDD'])
  })

  it('sorts by spread ascending for tight intent', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC'],
      latestBySymbol: {
        AAA: createFeed({ snapshot: { symbol: 'AAA', spread_bps: 40 } }),
        BBB: createFeed({ snapshot: { symbol: 'BBB', spread_bps: 8 } }),
        CCC: createFeed({ snapshot: { symbol: 'CCC', spread_bps: 22 } }),
      },
      intent: 'tight',
    })

    expect(ordered).toEqual(['BBB', 'CCC', 'AAA'])
  })

  it('sorts by traded value descending for value intent', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC'],
      latestBySymbol: {
        AAA: createFeed({ snapshot: { symbol: 'AAA', traded_value: 900_000_000 } }),
        BBB: createFeed({ snapshot: { symbol: 'BBB', traded_value: 4_200_000_000 } }),
        CCC: createFeed({ snapshot: { symbol: 'CCC', traded_value: 1_700_000_000 } }),
      },
      intent: 'value',
    })

    expect(ordered).toEqual(['BBB', 'CCC', 'AAA'])
  })

})
