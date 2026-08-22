import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { fetchStockOrdersBySymbol } from '../api/client'
import { ANALYTICS_REALTIME_REFETCH_MS } from '../../analytics/config'

export function useOrderTraceability(symbols: string[]) {
  const queries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['paperwork', 'orders-trace', symbol],
      queryFn: async () => {
        const response = await fetchStockOrdersBySymbol(symbol, 1)
        return {
          symbol,
          latestRecord: response.result.records[0] ?? null,
          recordCount: response.result.record_count,
        }
      },
      enabled: Boolean(symbol),
      refetchInterval: ANALYTICS_REALTIME_REFETCH_MS,
      refetchIntervalInBackground: true,
    })),
  })

  return useMemo(() => {
    const results = queries
      .map((query) => query.data)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))

    return {
      results,
      isLoading: queries.some((query) => query.isLoading),
      isFetching: queries.some((query) => query.isFetching),
      isError: queries.some((query) => query.isError),
      error: queries.find((query) => query.error)?.error ?? null,
    }
  }, [queries])
}
