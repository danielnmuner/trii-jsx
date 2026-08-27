import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { DailyClosingRecord } from '../api/schemas'
import { ANALYTICS_REALTIME_REFETCH_MS } from '../config'
import { summarizeDailyOrderPositionTimeline, type DailyOrderPositionSummary } from '../lib/orderPosition'
import { fetchStockOrdersBySymbol } from '../../paperwork/api/client'

type DailyClosingWindow = {
  symbol: string
  recordCount: number
  records: DailyClosingRecord[]
}

export function useDailyOrderPositionTimeline(windows: DailyClosingWindow[], enabled: boolean) {
  const queries = useQueries({
    queries: windows.map((window) => ({
      queryKey: ['analytics', 'order-position-timeline', window.symbol],
      queryFn: async (): Promise<Record<string, DailyOrderPositionSummary>> => {
        const response = await fetchStockOrdersBySymbol(window.symbol, 500)
        return summarizeDailyOrderPositionTimeline(
          window.symbol,
          response.result.records,
          window.records.map((record) => ({
            tradingDate: record.trading_date,
            lastPrice: record.last_price,
          })),
        )
      },
      enabled: enabled && Boolean(window.symbol),
      refetchInterval: ANALYTICS_REALTIME_REFETCH_MS,
      refetchIntervalInBackground: true,
    })),
  })

  return useMemo(() => {
    const bySymbol = Object.fromEntries(
      queries
        .map((query, index) => {
          const symbol = windows[index]?.symbol
          return symbol ? [symbol, query.data ?? {}] : null
        })
        .filter((entry): entry is [string, Record<string, DailyOrderPositionSummary>] => Boolean(entry)),
    )

    return {
      bySymbol,
      isLoading: queries.some((query) => query.isLoading),
      isFetching: queries.some((query) => query.isFetching),
      isError: queries.some((query) => query.isError),
      error: queries.find((query) => query.error)?.error ?? null,
    }
  }, [queries, windows])
}
