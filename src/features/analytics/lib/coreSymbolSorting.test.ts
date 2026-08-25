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
})
