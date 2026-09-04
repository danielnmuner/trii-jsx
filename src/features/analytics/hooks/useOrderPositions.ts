import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { fetchStockOrdersBySymbol } from '../../paperwork/api/client'
import type { SnapshotRecord } from '../api/schemas'
import { ANALYTICS_REALTIME_GC_MS, ANALYTICS_REALTIME_REFETCH_MS, ANALYTICS_REALTIME_STALE_MS } from '../config'
import { summarizeOrderPosition, type OrderPositionSummary } from '../lib/orderPosition'

export function useOrderPositions(snapshots: SnapshotRecord[], enabled: boolean) {
  const queries = useQueries({
    queries: snapshots.map((snapshot) => ({
      queryKey: ['analytics', 'order-position', snapshot.symbol],
      queryFn: async (): Promise<OrderPositionSummary> => {
        const response = await fetchStockOrdersBySymbol(snapshot.symbol, 500)
        return summarizeOrderPosition(snapshot.symbol, response.result.records, snapshot.last_price)
      },
      enabled: enabled && Boolean(snapshot.symbol),
      refetchInterval: ANALYTICS_REALTIME_REFETCH_MS,
      refetchIntervalInBackground: true,
      staleTime: ANALYTICS_REALTIME_STALE_MS,
      gcTime: ANALYTICS_REALTIME_GC_MS,
    })),
  })

  return useMemo(() => {
    const bySymbol = Object.fromEntries(
      queries
        .map((query) => query.data)
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map((item) => [item.symbol, item]),
    )

    return {
      bySymbol,
      isLoading: queries.some((query) => query.isLoading),
      isFetching: queries.some((query) => query.isFetching),
      isError: queries.some((query) => query.isError),
      error: queries.find((query) => query.error)?.error ?? null,
    }
  }, [queries])
}
