import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { getCachedDailyClosingLiquiditySummary, summarizeDailyClosingLiquidity } from './dailyClosingLiquidity'
import type { DailyClosingRecord } from '../api/schemas'

describe('dailyClosingLiquidity', () => {
  it('computes p50 and historical max from the full symbol sample', () => {
    const records: DailyClosingRecord[] = [
      { symbol: 'NUCO', trading_date: '2026-09-08', traded_volume: 120, traded_value: 1_200 },
      { symbol: 'NUCO', trading_date: '2026-09-09', traded_volume: 180, traded_value: 1_800 },
      { symbol: 'NUCO', trading_date: '2026-09-10', traded_volume: 300, traded_value: 2_600 },
      { symbol: 'NUCO', trading_date: '2026-09-11', traded_volume: 420, traded_value: 3_400 },
    ]

    expect(summarizeDailyClosingLiquidity(records)).toEqual({
      tradedVolumeP50: 240,
      tradedVolumeMax: 420,
      tradedValueP50: 2_200,
      tradedValueMax: 3_400,
    })
  })

  it('reads cached daily-closing data without requiring a fetch', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['analytics', 'daily-closing', 'ISA'], {
      symbol: 'ISA',
      recordCount: 3,
      records: [
        { symbol: 'ISA', trading_date: '2026-09-08', traded_volume: 10, traded_value: 100 },
        { symbol: 'ISA', trading_date: '2026-09-09', traded_volume: 30, traded_value: 300 },
        { symbol: 'ISA', trading_date: '2026-09-10', traded_volume: 50, traded_value: 900 },
      ],
    })

    expect(getCachedDailyClosingLiquiditySummary(queryClient, 'ISA')).toEqual({
      tradedVolumeP50: 30,
      tradedVolumeMax: 50,
      tradedValueP50: 300,
      tradedValueMax: 900,
    })
  })
})
