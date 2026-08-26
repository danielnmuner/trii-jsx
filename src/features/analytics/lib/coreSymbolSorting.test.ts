import { describe, expect, it } from 'vitest'
import type { AnalyticsSymbolFeed, HistoricStat } from '../api/schemas'
import { collectFlowSignalSymbols, rankCoreSymbols } from './coreSymbolSorting'

function createSnapshot(overrides: Partial<AnalyticsSymbolFeed['current_snapshot']> = {}): AnalyticsSymbolFeed['current_snapshot'] {
  return {
    symbol: 'TEST',
    captured_at: '2026-08-25T10:00:00-05:00',
    ...overrides,
  }
}

function createStat(overrides: Partial<HistoricStat> = {}): HistoricStat {
  return {
    sample_count: 10,
    latest_value: 10,
    mean: 5,
    stddev: 1,
    ...overrides,
  }
}

function createFeed({
  snapshot = {},
  currentStats = {},
}: {
  snapshot?: Partial<AnalyticsSymbolFeed['current_snapshot']>
  currentStats?: Partial<Record<string, HistoricStat>>
} = {}): AnalyticsSymbolFeed {
  return {
    symbol: snapshot.symbol ?? 'TEST',
    record_count: 2,
    from_timestamp: '2026-08-25T09:50:00-05:00',
    to_timestamp: '2026-08-25T10:00:00-05:00',
    current_snapshot: createSnapshot(snapshot),
    previous_snapshot: createSnapshot({ symbol: snapshot.symbol ?? 'TEST', captured_at: '2026-08-25T09:50:00-05:00' }),
    snapshots: [createSnapshot(snapshot)],
    current_stats: currentStats as Record<string, HistoricStat>,
  }
}

describe('rankCoreSymbols', () => {
  it('prioritizes held inventory first using snapshot or z-score fallback', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC'],
      latestBySymbol: {
        AAA: createFeed({ snapshot: { symbol: 'AAA' } }),
        BBB: createFeed({
          snapshot: {
            symbol: 'BBB',
            approved_position_summary: { available_quantity: 25 },
          } as Partial<AnalyticsSymbolFeed['current_snapshot']>,
        }),
        CCC: createFeed({ snapshot: { symbol: 'CCC' } }),
      },
      intent: 'held',
    })

    expect(ordered).toEqual(['AAA', 'BBB', 'CCC'])
  })

  it('sorts by daily change percent descending for up intent', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC'],
      latestBySymbol: {
        AAA: createFeed({ snapshot: { symbol: 'AAA', daily_change_percent: 120 } }),
        BBB: createFeed({ snapshot: { symbol: 'BBB', daily_change_percent: -50 } }),
        CCC: createFeed({ snapshot: { symbol: 'CCC', daily_change_percent: 600 } }),
      },
      intent: 'up',
    })

    expect(ordered).toEqual(['CCC', 'AAA', 'BBB'])
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

  it('sorts by most recent capture first for recent intent', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC'],
      latestBySymbol: {
        AAA: createFeed({ snapshot: { symbol: 'AAA', captured_at: '2026-08-25T10:01:00-05:00' } }),
        BBB: createFeed({ snapshot: { symbol: 'BBB', captured_at: '2026-08-25T10:05:00-05:00' } }),
        CCC: createFeed({ snapshot: { symbol: 'CCC', captured_at: '2026-08-25T09:59:00-05:00' } }),
      },
      intent: 'recent',
    })

    expect(ordered).toEqual(['BBB', 'AAA', 'CCC'])
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

  it('sorts by the strongest traded flow z-score descending for flow_z intent', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC'],
      latestBySymbol: {
        AAA: createFeed({
          snapshot: { symbol: 'AAA' },
          currentStats: {
            traded_volume: createStat({ latest_value: 7, mean: 5, stddev: 1 }),
            traded_value: createStat({ latest_value: 8, mean: 5, stddev: 1 }),
          },
        }),
        BBB: createFeed({
          snapshot: { symbol: 'BBB' },
          currentStats: {
            traded_volume: createStat({ latest_value: 12, mean: 5, stddev: 1 }),
          },
        }),
        CCC: createFeed({
          snapshot: { symbol: 'CCC' },
          currentStats: {
            traded_value: createStat({ latest_value: 9, mean: 5, stddev: 2 }),
          },
        }),
      },
      intent: 'flow_z',
    })

    expect(ordered).toEqual(['BBB', 'AAA', 'CCC'])
  })

  it('collects only symbols with a traded flow z-score above the threshold', () => {
    const activeSymbols = collectFlowSignalSymbols({
      symbols: ['AAA', 'BBB', 'CCC'],
      latestBySymbol: {
        AAA: createFeed({
          snapshot: { symbol: 'AAA' },
          currentStats: {
            traded_volume: createStat({ latest_value: 7, mean: 5, stddev: 1 }),
          },
        }),
        BBB: createFeed({
          snapshot: { symbol: 'BBB' },
          currentStats: {
            traded_value: createStat({ latest_value: 6.7, mean: 5, stddev: 1 }),
          },
        }),
        CCC: createFeed({
          snapshot: { symbol: 'CCC' },
          currentStats: {
            traded_value: createStat({ latest_value: 7.2, mean: 5, stddev: 1 }),
          },
        }),
      },
    })

    expect(activeSymbols).toEqual(['AAA', 'CCC'])
  })
})
