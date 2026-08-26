import { useMemo } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAnalyticsCatalog,
  fetchAnalyticsHistoricStats,
  fetchAnalyticsSnapshot,
  fetchDailyClosingSnapshots,
  fetchZscoreOpportunities,
} from '../api/client'
import { ANALYTICS_REALTIME_REFETCH_MS } from '../config'
import type { AnalyticsSymbolFeed, DailyClosingRecord, HistoricStat, SeasonalityProfile, ZscoreOpportunityRecord } from '../api/schemas'
import {
  filterDailyClosingRecords,
  filterZscoreOpportunityRecords,
  sanitizeAnalyticsSymbolFeed,
} from '../lib/analyticsDataPolicy'
import { isColombiaBusinessDateKey } from '../lib/colombiaBusinessCalendar'

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
      .map((item) => (item ? sanitizeAnalyticsSymbolFeed(item) : null))
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
  const queryClient = useQueryClient()
  const anchorDate = tradingDate ?? ''

  const queries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ['analytics', 'zscore-window', symbol, anchorDate],
      queryFn: async () => {
        const windowQueryKey = ['analytics', 'zscore-window', symbol, anchorDate] as const
        const cachedWindow = queryClient.getQueryData<{
          symbol: string
          tradingDate: string
          recordCount: number
          records: ZscoreOpportunityRecord[]
        }>(windowQueryKey)
        const latestCapturedAt = cachedWindow?.records.at(-1)?.captured_at
        let incomingRecords: ZscoreOpportunityRecord[] = []

        if (latestCapturedAt) {
          const response = await fetchZscoreOpportunities({
            symbol,
            sinceCapturedAt: latestCapturedAt,
          })
          incomingRecords = response.result.records
        } else {
          const trailingDates = buildTrailingBusinessDateKeys(anchorDate, 3)
          const response = await fetchZscoreOpportunities({
            symbol,
            fromTradingDate: trailingDates[0],
            toTradingDate: trailingDates[trailingDates.length - 1],
          })
          incomingRecords = response.result.records
        }

        const mergedRecords = mergeZscoreWindowRecords(cachedWindow?.records ?? [], incomingRecords)

        return {
          symbol,
          tradingDate: anchorDate,
          recordCount: mergedRecords.length,
          records: mergedRecords,
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

function mergeZscoreWindowRecords(existingRecords: ZscoreOpportunityRecord[], incomingRecords: ZscoreOpportunityRecord[]) {
  const uniqueRecords = new Map<string, ZscoreOpportunityRecord>()

  for (const record of [...existingRecords, ...incomingRecords]) {
    const key = record.snapshot_checksum || `${record.symbol}-${record.captured_at}`
    uniqueRecords.set(key, record)
  }

  const sorted = [...uniqueRecords.values()].sort(
    (left, right) => new Date(left.captured_at).getTime() - new Date(right.captured_at).getTime(),
  )

  return filterZscoreOpportunityRecords(sorted)
}

function buildTrailingBusinessDateKeys(anchorDate: string, count: number) {
  if (count <= 0) {
    return []
  }

  const [year, month, day] = anchorDate.split('-').map(Number)
  const cursor = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(cursor.getTime())) {
    return [anchorDate]
  }

  const dates: string[] = []
  while (dates.length < count) {
    const dateKey = toDateKey(cursor)
    if (isColombiaBusinessDateKey(dateKey)) {
      dates.unshift(dateKey)
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return dates
}

function toDateKey(date: Date) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sortDailyClosingRecords(records: DailyClosingRecord[]) {
  return filterDailyClosingRecords(records)
    .sort((left, right) => {
    const leftTime = new Date(left.source_captured_at ?? `${left.trading_date}T00:00:00-05:00`).getTime()
    const rightTime = new Date(right.source_captured_at ?? `${right.trading_date}T00:00:00-05:00`).getTime()

    if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
      return leftTime - rightTime
    }

    return left.trading_date.localeCompare(right.trading_date)
    })
}
