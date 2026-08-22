import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  fetchAnalyticsCatalog,
  fetchAnalyticsHistoricStats,
  fetchAnalyticsSnapshot,
  fetchDailyClosingSnapshots,
  fetchZscoreOpportunities,
} from '../api/client'
import { ANALYTICS_REALTIME_REFETCH_MS } from '../config'
import type { AnalyticsSymbolFeed, HistoricStat, SeasonalityProfile } from '../api/schemas'

export function useAnalyticsCatalog() {
  return useQuery({
    queryKey: ['analytics', 'catalog'],
    queryFn: () => fetchAnalyticsCatalog(),
  })
}

export function useAnalyticsSnapshots(symbols: string[]) {
  const queries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['analytics', 'symbol-feed', symbol],
      queryFn: async (): Promise<AnalyticsSymbolFeed> => {
        const [snapshotResponse, historicStatsResponse] = await Promise.all([
          fetchAnalyticsSnapshot(symbol),
          fetchAnalyticsHistoricStats(symbol),
        ])

        return {
          ...snapshotResponse.result,
          current_stats: mapHistoricStatsByMetric(historicStatsResponse.result.records),
          seasonality_profile: findSeasonalityProfile(historicStatsResponse.result.records),
        }
      },
      refetchInterval: ANALYTICS_REALTIME_REFETCH_MS,
      refetchIntervalInBackground: true,
    })),
  })

  return useMemo(() => {
    const results = queries
      .map((query) => query.data)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
    const lastUpdatedAt = queries.reduce((maxValue, query) => Math.max(maxValue, query.dataUpdatedAt ?? 0), 0)

    return {
      results,
      lastUpdatedAt,
      isLoading: queries.some((query) => query.isLoading),
      isFetching: queries.some((query) => query.isFetching),
      isError: queries.some((query) => query.isError),
      error: queries.find((query) => query.error)?.error ?? null,
    }
  }, [queries])
}

function mapHistoricStatsByMetric(records: Array<HistoricStat | SeasonalityProfile>) {
  return records.reduce<Record<string, HistoricStat>>((accumulator, record) => {
    const metric = typeof record.metric === 'string' ? record.metric.trim() : undefined
    if (!metric) {
      return accumulator
    }

    accumulator[metric] = record as HistoricStat
    return accumulator
  }, {})
}

function findSeasonalityProfile(records: Array<HistoricStat | SeasonalityProfile>) {
  return records.find(
    (record): record is SeasonalityProfile =>
      ('record_type' in record && record.record_type === 'seasonality_profile') ||
      ('sk' in record && record.sk === 'seasonality_profile'),
  )
}

export function useZscoreOpportunities(symbol: string, tradingDate: string | null) {
  return useQuery({
    queryKey: ['analytics', 'zscore-opportunities', symbol, tradingDate],
    queryFn: () => fetchZscoreOpportunities(symbol, tradingDate ?? ''),
    refetchInterval: ANALYTICS_REALTIME_REFETCH_MS,
    refetchIntervalInBackground: true,
    enabled: Boolean(symbol && tradingDate),
  })
}

export function useDailyClosingSnapshots(symbol: string) {
  return useQuery({
    queryKey: ['analytics', 'daily-closing', symbol],
    queryFn: () => fetchDailyClosingSnapshots(symbol),
    refetchInterval: ANALYTICS_REALTIME_REFETCH_MS,
    refetchIntervalInBackground: true,
    enabled: Boolean(symbol),
  })
}
