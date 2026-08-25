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
import type { AnalyticsSymbolFeed, DailyClosingRecord, HistoricStat, SeasonalityProfile, ZscoreOpportunityRecord } from '../api/schemas'

export function useAnalyticsCatalog() {
  return useQuery({
    queryKey: ['analytics', 'catalog'],
    queryFn: () => fetchAnalyticsCatalog(),
    refetchInterval: ANALYTICS_REALTIME_REFETCH_MS,
    refetchIntervalInBackground: true,
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

export function useZscoreOpportunityWindows(symbols: string[], tradingDate: string | null, enabled = true) {
  const anchorDate = tradingDate ?? ''
  const previousDate = tradingDate ? toPreviousDate(tradingDate) : ''

  const queries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['analytics', 'zscore-window', symbol, anchorDate],
      queryFn: async () => {
        const [currentDayResponse, previousDayResponse] = await Promise.all([
          fetchZscoreOpportunities(symbol, anchorDate),
          previousDate ? fetchZscoreOpportunities(symbol, previousDate) : Promise.resolve(null),
        ])

        return {
          symbol,
          tradingDate: anchorDate,
          recordCount: (currentDayResponse.result.record_count ?? 0) + (previousDayResponse?.result.record_count ?? 0),
          records: mergeZscoreWindowRecords(currentDayResponse.result.records, previousDayResponse?.result.records ?? []),
        }
      },
      refetchInterval: ANALYTICS_REALTIME_REFETCH_MS,
      refetchIntervalInBackground: true,
      enabled: enabled && Boolean(symbol && anchorDate),
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

export function useDailyClosingSnapshots(symbols: string[], enabled = true) {
  const queries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['analytics', 'daily-closing', symbol],
      queryFn: async () => {
        const response = await fetchDailyClosingSnapshots(symbol)
        return {
          symbol,
          recordCount: response.result.record_count,
          records: sortDailyClosingRecords(response.result.records),
        }
      },
      refetchInterval: ANALYTICS_REALTIME_REFETCH_MS,
      refetchIntervalInBackground: true,
      enabled: enabled && Boolean(symbol),
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

function mergeZscoreWindowRecords(currentRecords: ZscoreOpportunityRecord[], previousRecords: ZscoreOpportunityRecord[]) {
  const uniqueRecords = new Map<string, ZscoreOpportunityRecord>()

  for (const record of [...previousRecords, ...currentRecords]) {
    const key = record.snapshot_checksum || `${record.symbol}-${record.captured_at}`
    uniqueRecords.set(key, record)
  }

  const sorted = [...uniqueRecords.values()].sort(
    (left, right) => new Date(left.captured_at).getTime() - new Date(right.captured_at).getTime(),
  )

  return sorted
}

function toPreviousDate(value: string) {
  const base = new Date(`${value}T00:00:00`)
  if (Number.isNaN(base.getTime())) {
    return value
  }

  base.setDate(base.getDate() - 1)
  return base.toISOString().slice(0, 10)
}

function sortDailyClosingRecords(records: DailyClosingRecord[]) {
  return [...records].sort((left, right) => {
    const leftTime = new Date(left.source_captured_at ?? `${left.trading_date}T00:00:00-05:00`).getTime()
    const rightTime = new Date(right.source_captured_at ?? `${right.trading_date}T00:00:00-05:00`).getTime()

    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
      return leftTime - rightTime
    }

    return left.trading_date.localeCompare(right.trading_date)
  })
}
