import { describe, expect, it } from 'vitest'
import type { AnalyticsSymbolFeed, ZscoreOpportunityRecord } from '../api/schemas'
import { rankCoreSymbols } from './coreSymbolSorting'

function createSnapshot(overrides: Partial<AnalyticsSymbolFeed['current_snapshot']> = {}): AnalyticsSymbolFeed['current_snapshot'] {
  return {
    symbol: 'TEST',
    captured_at: '2026-08-25T10:00:00-05:00',
    ...overrides,
  }
}

function createOpportunity(overrides: Partial<ZscoreOpportunityRecord> = {}): ZscoreOpportunityRecord {
  return {
    symbol: 'TEST',
    captured_at: '2026-08-25T10:00:00-05:00',
    triggered_z_scores: {},
    ...overrides,
  }
}

describe('rankCoreSymbols', () => {
  it('prioritizes held inventory first using snapshot or z-score fallback', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC'],
      latestBySymbol: {
        AAA: createSnapshot({ symbol: 'AAA' }),
        BBB: createSnapshot({
          symbol: 'BBB',
          approved_position_summary: { available_quantity: 25 },
        } as Partial<AnalyticsSymbolFeed['current_snapshot']>),
        CCC: createSnapshot({ symbol: 'CCC' }),
      },
      latestZscoreBySymbol: {
        AAA: createOpportunity({
          symbol: 'AAA',
          approved_position_summary: { available_quantity: 100 },
        } as Partial<ZscoreOpportunityRecord>),
        BBB: undefined,
        CCC: undefined,
      },
      intent: 'held',
    })

    expect(ordered).toEqual(['AAA', 'BBB', 'CCC'])
  })

  it('sorts by daily change percent descending for up intent', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC'],
      latestBySymbol: {
        AAA: createSnapshot({ symbol: 'AAA', daily_change_percent: 120 }),
        BBB: createSnapshot({ symbol: 'BBB', daily_change_percent: -50 }),
        CCC: createSnapshot({ symbol: 'CCC', daily_change_percent: 600 }),
      },
      latestZscoreBySymbol: {},
      intent: 'up',
    })

    expect(ordered).toEqual(['CCC', 'AAA', 'BBB'])
  })

  it('sorts by spread ascending for tight intent', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC'],
      latestBySymbol: {
        AAA: createSnapshot({ symbol: 'AAA', spread_bps: 40 }),
        BBB: createSnapshot({ symbol: 'BBB', spread_bps: 8 }),
        CCC: createSnapshot({ symbol: 'CCC', spread_bps: 22 }),
      },
      latestZscoreBySymbol: {},
      intent: 'tight',
    })

    expect(ordered).toEqual(['BBB', 'CCC', 'AAA'])
  })

  it('sorts by most recent capture first for recent intent', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC'],
      latestBySymbol: {
        AAA: createSnapshot({ symbol: 'AAA', captured_at: '2026-08-25T10:01:00-05:00' }),
        BBB: createSnapshot({ symbol: 'BBB', captured_at: '2026-08-25T10:05:00-05:00' }),
        CCC: createSnapshot({ symbol: 'CCC', captured_at: '2026-08-25T09:59:00-05:00' }),
      },
      latestZscoreBySymbol: {},
      intent: 'recent',
    })

    expect(ordered).toEqual(['BBB', 'AAA', 'CCC'])
  })

  it('sorts by traded value descending for value intent', () => {
    const ordered = rankCoreSymbols({
      baseOrder: ['AAA', 'BBB', 'CCC'],
      latestBySymbol: {
        AAA: createSnapshot({ symbol: 'AAA', traded_value: 900_000_000 }),
        BBB: createSnapshot({ symbol: 'BBB', traded_value: 4_200_000_000 }),
        CCC: createSnapshot({ symbol: 'CCC', traded_value: 1_700_000_000 }),
      },
      latestZscoreBySymbol: {},
      intent: 'value',
    })

    expect(ordered).toEqual(['BBB', 'CCC', 'AAA'])
  })
})
